#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function resolveOpenClawRoot() {
  if (process.env.OPENCLAW_ROOT) return path.resolve(process.env.OPENCLAW_ROOT);
  const npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  return path.join(npmRoot, "openclaw");
}

async function importFresh(filePath) {
  const href = pathToFileURL(filePath).href;
  return import(`${href}?verify=${Date.now()}-${Math.random()}`);
}

function getText(result) {
  const block = result?.content?.find((entry) => entry?.type === "text");
  return typeof block?.text === "string" ? block.text : "";
}

async function createHostReadTool(openclawTools, piTools, root) {
  return openclawTools.u(piTools.createReadTool(root, {
    operations: {
      readFile: (absolutePath) => fs.readFile(absolutePath),
      access: (absolutePath) => fs.access(absolutePath)
    }
  }), {});
}

async function testHostWriteRead(openclawTools, piTools) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "oc-write-read-host-"));
  const write = openclawTools.l(root, { workspaceOnly: true });
  const read = await createHostReadTool(openclawTools, piTools, root);

  await write.execute("write-host", {
    path: "notes/host.txt",
    content: "host write content"
  });

  const result = await read.execute("read-host", { path: "notes/host.txt" });
  assert.equal(getText(result), "host write content");
}

async function testHostEditRead(openclawTools, piTools) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "oc-write-read-edit-"));
  await fs.writeFile(path.join(root, "edit.txt"), "before edit", "utf8");

  const edit = openclawTools.c(root, { workspaceOnly: true });
  const read = await createHostReadTool(openclawTools, piTools, root);

  await edit.execute("edit-host", {
    path: "edit.txt",
    edits: [{
      oldText: "before edit",
      newText: "after edit"
    }]
  });

  const result = await read.execute("read-edit", { path: "edit.txt" });
  assert.equal(getText(result), "after edit");
}

async function testMemoryFlushAppend(openclawTools) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "oc-write-read-memory-"));
  const fallbackTool = {
    name: "write",
    execute: async () => {
      throw new Error("memory flush wrapper should not call fallback write");
    }
  };
  const memoryWrite = openclawTools.m(fallbackTool, {
    root,
    relativePath: "memory/flush.md"
  });

  await memoryWrite.execute("memory-1", {
    path: "memory/flush.md",
    content: "first"
  });
  await memoryWrite.execute("memory-2", {
    path: "memory/flush.md",
    content: "second"
  });

  const content = await fs.readFile(path.join(root, "memory/flush.md"), "utf8");
  assert.equal(content, "first\nsecond");
}

function enoent(filePath) {
  const error = new Error(`missing: ${filePath}`);
  error.code = "ENOENT";
  return error;
}

function createFakeBridge(options = {}) {
  const files = new Map(Object.entries(options.initialFiles ?? {}));
  let writeCount = 0;
  let statAfterWriteCalls = 0;
  let readAfterWriteCalls = 0;

  return {
    counts: () => ({
      writeCount,
      statAfterWriteCalls,
      readAfterWriteCalls
    }),
    getFile: (filePath) => files.get(filePath),
    async mkdirp() {},
    async writeFile({ filePath, data }) {
      files.set(filePath, String(data));
      writeCount += 1;
    },
    async stat({ filePath }) {
      if (!files.has(filePath)) return false;
      if (writeCount > 0 && options.permanentInvisible) return false;
      if (writeCount > 0) {
        statAfterWriteCalls += 1;
        if (statAfterWriteCalls <= (options.visibleAfterStatCalls ?? 0)) return false;
      }
      return true;
    },
    async readFile({ filePath }) {
      if (!files.has(filePath) || (writeCount > 0 && options.permanentInvisible)) {
        throw enoent(filePath);
      }
      if (writeCount > 0) {
        readAfterWriteCalls += 1;
        if (readAfterWriteCalls <= (options.staleAfterWriteReads ?? 0)) {
          return Buffer.from(options.staleContent ?? "stale");
        }
      }
      return Buffer.from(files.get(filePath));
    }
  };
}

async function testSandboxDelayedWrite(openclawTools) {
  const bridge = createFakeBridge({
    visibleAfterStatCalls: 2,
    staleAfterWriteReads: 2
  });
  const write = openclawTools.p({
    root: "/workspace",
    bridge
  });

  await write.execute("sandbox-write", {
    path: "notes/sandbox.txt",
    content: "fresh sandbox content"
  });

  assert.equal(bridge.getFile("/workspace/notes/sandbox.txt"), "fresh sandbox content");
  assert.ok(bridge.counts().statAfterWriteCalls >= 3);
  assert.ok(bridge.counts().readAfterWriteCalls >= 3);
}

async function testSandboxDelayedEdit(openclawTools) {
  const bridge = createFakeBridge({
    initialFiles: {
      "/workspace/edit.txt": "old sandbox content"
    },
    visibleAfterStatCalls: 1,
    staleAfterWriteReads: 1,
    staleContent: "old sandbox content"
  });
  const edit = openclawTools.d({
    root: "/workspace",
    bridge
  });

  await edit.execute("sandbox-edit", {
    path: "edit.txt",
    edits: [{
      oldText: "old sandbox content",
      newText: "new sandbox content"
    }]
  });

  assert.equal(bridge.getFile("/workspace/edit.txt"), "new sandbox content");
  assert.ok(bridge.counts().statAfterWriteCalls >= 2);
  assert.ok(bridge.counts().readAfterWriteCalls >= 2);
}

async function testSandboxPermanentInvisibleFailure(openclawTools) {
  const bridge = createFakeBridge({ permanentInvisible: true });
  const write = openclawTools.p({
    root: "/workspace",
    bridge
  });

  await assert.rejects(
    () => write.execute("sandbox-invisible", {
      path: "notes/invisible.txt",
      content: "lost content"
    }),
    /not readable through the same filesystem view/
  );
}

async function testSandboxPermanentStaleFailure(openclawTools) {
  const bridge = createFakeBridge({
    staleAfterWriteReads: 99,
    staleContent: "old content"
  });
  const write = openclawTools.p({
    root: "/workspace",
    bridge
  });

  await assert.rejects(
    () => write.execute("sandbox-stale", {
      path: "notes/stale.txt",
      content: "new content"
    }),
    /read-back content did not match/
  );
}

const openclawRoot = resolveOpenClawRoot();
const packageJson = JSON.parse(await fs.readFile(path.join(openclawRoot, "package.json"), "utf8"));
assert.equal(packageJson.version, "2026.5.7", "this verifier targets OpenClaw 2026.5.7");

const openclawTools = await importFresh(path.join(openclawRoot, "dist/openclaw-tools-0ftkmYS3.js"));
const piTools = await importFresh(path.join(openclawRoot, "node_modules/@mariozechner/pi-coding-agent/dist/index.js"));

assert.equal(typeof openclawTools.l, "function", "host write tool export is available");
assert.equal(typeof openclawTools.c, "function", "host edit tool export is available");
assert.equal(typeof openclawTools.p, "function", "sandbox write tool export is available");
assert.equal(typeof openclawTools.d, "function", "sandbox edit tool export is available");
assert.equal(typeof openclawTools.m, "function", "memory flush wrapper export is available");

await testHostWriteRead(openclawTools, piTools);
await testHostEditRead(openclawTools, piTools);
await testMemoryFlushAppend(openclawTools);
await testSandboxDelayedWrite(openclawTools);
await testSandboxDelayedEdit(openclawTools);
await testSandboxPermanentInvisibleFailure(openclawTools);
await testSandboxPermanentStaleFailure(openclawTools);

console.log(`write-read consistency verification passed for ${openclawRoot}`);
