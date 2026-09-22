#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: verify-exec-recovery-proof.mjs <OPENCLAW_ROOT>");
  process.exit(2);
}

const dist = path.join(root, "dist");
const files = fs.readdirSync(dist).filter((n) => n.endsWith(".js"));
const hits = [];
for (const name of files) {
  const text = fs.readFileSync(path.join(dist, name), "utf8");
  if (!text.includes("function resolveToolErrorWarningPolicy")) continue;
  hits.push({ name, text });
}

if (hits.length !== 1) {
  console.error(`expected 1 payloads bundle, got ${hits.length}`);
  process.exit(1);
}

const { name, text } = hits[0];
const execIdx = text.indexOf(
  "if (isExecLikeToolName(params.lastToolError.toolName)) return {\n\t\tshowWarning: !params.hasUserFacingReply",
);
const mutatingIdx = text.indexOf(
  "if (params.lastToolError.mutatingAction ?? isLikelyMutatingToolName(params.lastToolError.toolName)) return {",
);

if (execIdx < 0) {
  console.error(`${name}: exec-like recovery-proof branch missing`);
  process.exit(1);
}
if (mutatingIdx < 0) {
  console.error(`${name}: mutating branch missing`);
  process.exit(1);
}
if (!(execIdx < mutatingIdx)) {
  console.error(`${name}: exec-like branch must appear before mutating branch`);
  process.exit(1);
}
if (text.includes("isExecLikeToolName(params.lastToolError.toolName) && !includeDetails")) {
  console.error(`${name}: obsolete exec+!includeDetails branch still present`);
  process.exit(1);
}

console.log(`ok: ${name} has exec recovery-proof before mutating branch`);
