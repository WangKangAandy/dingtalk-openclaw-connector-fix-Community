import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setupGuidance, runGuidanceCli } from '../../bin/agent-guidance.js';
import { provisionRules, ruleNames, templatesDirectory } from '../../bin/guidance-files.js';
import { createOpenClaw, runOpenClaw, resolveOpenClaw } from '../../bin/guidance-openclaw.js';

const templateName = 'dws-openclaw.md';
const template = fs.readFileSync(path.join(templatesDirectory, templateName));
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'connector-guidance-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, directory: path.join(root, 'dingtalk') };
}
function output() {
  const lines = [];
  return { lines, log: (v) => lines.push(v), error: (v) => lines.push(v) };
}
const receipt = () => ({ ok: true, pluginIds: ['agent-guidance'], restartRequired: false,
  runtime: { operationId: 'test-reload', generation: 2, pluginIds: ['agent-guidance'] } });
function mock(plugins = {}) {
  const calls = [];
  const cli = {
    calls, state: structuredClone(plugins),
    async plugins() { calls.push('read'); return structuredClone(cli.state); },
    async inspect() { calls.push('inspect'); },
    async patch(value) {
      calls.push('patch'); cli.lastPatch = value;
      cli.state = { ...cli.state, ...value.plugins,
        entries: { ...cli.state.entries, ...value.plugins.entries } };
    },
    async reload() { calls.push('reload'); return receipt(); },
  };
  return cli;
}
const configured = (directory, extra = {}) => ({ entries: { 'agent-guidance': {
  config: { directory, agents: ['main'], append: [templateName], ...extra },
} } });

test('setup provisions, patches only guidance settings, and waits for reload', async (t) => {
  const { directory } = fixture(t);
  const cli = mock({ allow: ['dingtalk-connector'], entries: { unrelated: { config: { token: '__REDACTED__' } } } });
  const io = output();
  await setupGuidance({ directory, agents: ['main', 'work', 'main'] }, cli, io);
  assert.deepEqual(cli.calls, ['read', 'inspect', 'patch', 'reload']);
  assert.deepEqual(fs.readFileSync(path.join(directory, templateName)), template);
  assert.deepEqual(cli.lastPatch.plugins.allow, ['dingtalk-connector', 'agent-guidance']);
  assert.deepEqual(Object.keys(cli.lastPatch.plugins.entries), ['agent-guidance']);
  assert.deepEqual(cli.state.entries['agent-guidance'].config.agents, ['main', 'work']);
  assert.ok(io.lines.some((s) => s.startsWith('Reloaded agent-guidance:')));
});

test('existing edited rules are skipped without comparing or rewriting; repeat setup reuses scope', async (t) => {
  const { directory } = fixture(t);
  fs.mkdirSync(directory);
  const file = path.join(directory, templateName);
  fs.writeFileSync(file, '# Custom\n');
  fs.utimesSync(file, new Date(0), new Date(0));
  const before = fs.statSync(file);
  const io = output();
  const cli = mock(configured(directory));
  await setupGuidance({}, cli, io);
  await setupGuidance({}, cli, io);
  assert.equal(fs.readFileSync(file, 'utf8'), '# Custom\n');
  assert.equal(fs.statSync(file).mtimeMs, before.mtimeMs);
  assert.equal(fs.statSync(file).ino, before.ino);
  assert.ok(io.lines.includes(`exists (skipped): ${templateName}`));
  assert.deepEqual(cli.state.entries['agent-guidance'].config.append, [templateName]);
});

test('--overwrite-rules replaces bundled names only and preserves user files', async (t) => {
  const { directory } = fixture(t);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, templateName), '# Old');
  fs.writeFileSync(path.join(directory, 'custom.md'), '# Custom');
  const cli = mock(configured(directory));
  assert.equal(await runGuidanceCli(['setup', '--overwrite-rules'], output(), cli), 0);
  assert.deepEqual(fs.readFileSync(path.join(directory, templateName)), template);
  assert.equal(fs.readFileSync(path.join(directory, 'custom.md'), 'utf8'), '# Custom');
  assert.deepEqual(ruleNames(directory), ['custom.md', templateName]);
});

test('new package Markdown requires no code or manifest change; removed package files are kept', (t) => {
  const { root, directory } = fixture(t);
  const templates = path.join(root, 'templates');
  fs.mkdirSync(templates);
  fs.writeFileSync(path.join(templates, 'one.md'), '# One');
  provisionRules(directory, { templates });
  fs.writeFileSync(path.join(templates, 'two.md'), '# Two');
  fs.unlinkSync(path.join(templates, 'one.md'));
  provisionRules(directory, { templates });
  assert.deepEqual(ruleNames(directory), ['one.md', 'two.md']);
});

test('all top-level Markdown is included; preserve placement/order, dedupe, drop removed references', async (t) => {
  const { directory } = fixture(t);
  fs.mkdirSync(directory);
  for (const name of ['backup.md', 'notes.md', 'z.md', 'a.md', 'ignored.txt']) fs.writeFileSync(path.join(directory, name), name);
  fs.mkdirSync(path.join(directory, 'nested'));
  fs.mkdirSync(path.join(directory, 'not-a-file.md'));
  fs.writeFileSync(path.join(directory, 'nested', 'hidden.md'), '# Nested');
  const cli = mock(configured(directory, { prepend: ['z.md'], append: ['notes.md', 'z.md', 'notes.md', 'deleted.md'] }));
  await setupGuidance({}, cli, output());
  assert.deepEqual(cli.state.entries['agent-guidance'].config.prepend, ['z.md']);
  assert.deepEqual(cli.state.entries['agent-guidance'].config.append, ['notes.md', 'a.md', 'backup.md', templateName]);
});

test('file content errors are delegated to the official loader and reported as failure', async (t) => {
  const { directory } = fixture(t);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, templateName), Buffer.alloc(70_000, 0xff));
  const cli = mock(configured(directory));
  cli.reload = async () => { throw new Error('Official loader: instruction file could not be loaded'); };
  const io = output();
  assert.equal(await runGuidanceCli(['setup'], io, cli), 1);
  assert.deepEqual(cli.lastPatch.plugins.entries['agent-guidance'].config.append, [templateName]);
  assert.equal(fs.statSync(path.join(directory, templateName)).size, 70_000);
  assert.ok(io.lines.some((s) => s.includes('Official loader:')));
  assert.ok(!io.lines.some((s) => s.startsWith('Reloaded agent-guidance:')));
});

test('official config rejection stops before reload; mocks do not imply invalid config was persisted', async (t) => {
  const { directory } = fixture(t);
  fs.mkdirSync(directory);
  for (let i = 0; i < 9; i++) fs.writeFileSync(path.join(directory, `${i}.md`), '# Rule');
  const cli = mock(configured(directory));
  cli.patch = async (value) => {
    assert.equal(value.plugins.entries['agent-guidance'].config.append.length, 10);
    cli.calls.push('patch-rejected');
    throw new Error('Official schema: append must NOT have more than 8 items');
  };
  const io = output();
  assert.equal(await runGuidanceCli(['setup'], io, cli), 1);
  assert.deepEqual(cli.calls, ['read', 'inspect', 'patch-rejected']);
  assert.ok(io.lines.some((line) => line.includes('Official schema:')));
});

test('different directory/Agent scope or global deny stops before file writes', async (t) => {
  const { root, directory } = fixture(t);
  for (const state of [configured(path.join(root, 'other')), configured(directory, { agents: ['research'] }),
    { enabled: false }, { deny: ['agent-guidance'] }]) {
    const cli = mock(state);
    await assert.rejects(setupGuidance({ directory, agents: ['main'] }, cli, output()));
    assert.deepEqual(cli.calls, ['read']);
    assert.equal(fs.existsSync(directory), false);
  }
});

test('missing initial scope, relative directory, or unsupported plugin has no file/config effects', async (t) => {
  const { directory } = fixture(t);
  const cli = mock();
  await assert.rejects(setupGuidance({ directory }, cli, output()), /--agents/);
  await assert.rejects(setupGuidance({ directory: 'relative', agents: ['main'] }, cli, output()), /absolute/);
  cli.inspect = async () => { throw new Error('Plugin not found'); };
  await assert.rejects(setupGuidance({ directory, agents: ['main'] }, cli, output()), /Plugin not found/);
  assert.equal(fs.existsSync(directory), false);
  assert.equal(cli.lastPatch, undefined);
});

test('config refusal is returned without reload or automatic retry; files remain available', async (t) => {
  const { directory } = fixture(t);
  const cli = mock();
  cli.patch = async () => { cli.calls.push('patch'); throw new Error('OPENCLAW_CONFIG_READONLY'); };
  const io = output();
  assert.equal(await runGuidanceCli(['setup', '--directory', directory, '--agents', 'main'], io, cli), 1);
  assert.deepEqual(cli.calls, ['read', 'inspect', 'patch']);
  assert.ok(fs.existsSync(path.join(directory, templateName)));
  assert.ok(io.lines.some((s) => s.includes('READONLY')));
});

test('bundled registration refresh succeeds despite code-restart warning and never restarts Gateway', async (t) => {
  const { directory } = fixture(t);
  const cli = mock(configured(directory));
  const warning = 'Bundled plugin code is owned by the running Gateway. Restart the Gateway to load updated code.';
  cli.reload = async () => { cli.calls.push('reload'); return { ...receipt(), restartRequired: true, warnings: [warning] }; };
  const io = output();
  assert.equal(await runGuidanceCli(['setup'], io, cli), 0);
  assert.deepEqual(cli.calls, ['read', 'inspect', 'patch', 'reload']);
  assert.ok(io.lines.includes(warning));
  assert.ok(io.lines.some((line) => line.includes('Setup did not restart the Gateway')));
  assert.ok(io.lines.some((line) => line.startsWith('Reloaded agent-guidance:')));
});

test('explicit setup enables a previously disabled plugin and its required hooks', async (t) => {
  const { directory } = fixture(t);
  const plugins = configured(directory);
  Object.assign(plugins.entries['agent-guidance'], { enabled: false, hooks: { allowPromptInjection: false } });
  const cli = mock(plugins);
  assert.equal(await runGuidanceCli(['setup'], output(), cli), 0);
  assert.equal(cli.lastPatch.plugins.entries['agent-guidance'].enabled, true);
  assert.deepEqual(cli.lastPatch.plugins.entries['agent-guidance'].hooks,
    { allowConversationAccess: true, allowPromptInjection: true });
});

test('incomplete existing scope gets an actionable error without writes', async (t) => {
  const { directory } = fixture(t);
  for (const config of [{ directory }, { agents: ['main'] }]) {
    const cli = mock({ entries: { 'agent-guidance': { config } } });
    await assert.rejects(setupGuidance({ directory, agents: ['main'] }, cli, output()), /configuration is incomplete/);
    assert.deepEqual(cli.calls, ['read']);
  }
});

test('unconfirmed reload never reports activation success', async (t) => {
  const { directory } = fixture(t);
  for (const response of [{ ...receipt(), ok: false }, { ok: true }, { ...receipt(), runtime: { pluginIds: [] } }]) {
    const cli = mock(configured(directory));
    cli.reload = async () => response;
    const io = output();
    assert.equal(await runGuidanceCli(['setup'], io, cli), 1);
    assert.ok(!io.lines.some((s) => s.startsWith('Reloaded agent-guidance:')));
  }
});

test('write safety rejects linked directories, hardlinked overwrite targets, and package paths', (t) => {
  const { root, directory } = fixture(t);
  const linked = path.join(root, 'linked');
  fs.mkdirSync(directory);
  fs.symlinkSync(directory, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => provisionRules(linked), /linked/);
  const original = path.join(root, 'keep.md');
  fs.writeFileSync(original, '# Keep');
  fs.linkSync(original, path.join(directory, templateName));
  assert.equal(provisionRules(directory)[0].status, 'exists (skipped)');
  assert.throws(() => provisionRules(directory, { overwrite: true }), /linked/);
  assert.equal(fs.readFileSync(original, 'utf8'), '# Keep');
  assert.throws(() => provisionRules(templatesDirectory), /outside/);
});

test('file symlink is skipped by default, cannot be overwritten', (t) => {
  const { root, directory } = fixture(t);
  fs.mkdirSync(directory);
  const original = path.join(root, 'keep.md');
  fs.writeFileSync(original, '# Keep');
  try { fs.symlinkSync(original, path.join(directory, templateName)); }
  catch (err) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(err.code)) return t.skip('File symlink privilege unavailable; Linux CI covers this.');
    throw err;
  }
  assert.equal(provisionRules(directory)[0].status, 'exists (skipped)');
  assert.throws(() => provisionRules(directory, { overwrite: true }), /linked/);
  assert.equal(fs.readFileSync(original, 'utf8'), '# Keep');
});

test('adapter only treats the official unset-path error as empty config', async () => {
  const fail = (message) => Object.assign(new Error(message), { stdout: JSON.stringify({ ok: false, error: { message } }) });
  const missing = createOpenClaw(async () => { throw fail('Config path is valid but unset: plugins. The runtime default applies'); });
  assert.deepEqual(await missing.plugins(), {});
  const denied = createOpenClaw(async () => { throw fail('Permission denied'); });
  await assert.rejects(denied.plugins(), /Permission denied/);
});

test('adapter uses config patch stdin and official completed-reload contract', async () => {
  const calls = [];
  const cli = createOpenClaw(async (args, input) => {
    calls.push({ args, input });
    return { stdout: args[1] === 'reload' ? JSON.stringify(receipt()) : '{}', stderr: '' };
  }, output());
  await cli.patch({ plugins: { entries: {} } });
  assert.deepEqual(await cli.reload(), receipt());
  assert.deepEqual(calls[0].args, ['config', 'patch', '--stdin']);
  assert.deepEqual(JSON.parse(calls[0].input), { plugins: { entries: {} } });
  assert.deepEqual(calls[1].args, ['plugins', 'reload', 'agent-guidance', '--wait', '--json']);
});

test('CLI runner preserves literal arguments/stdin through Node without a shell and propagates failures', async (t) => {
  const { root } = fixture(t);
  const script = path.join(root, 'fake-openclaw.cjs');
  fs.writeFileSync(script, `let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>s+=v);process.stdin.on('end',()=>{if(process.argv[2]==='fail'){process.stderr.write('official failure');process.exitCode=1;}else console.log(JSON.stringify({args:process.argv.slice(2),input:s}));});`);
  const executable = { command: process.execPath, prefix: [script] };
  const args = ['config', 'patch', 'spaces " & $() 中文'];
  const input = JSON.stringify({ directory: 'a " & b' });
  const result = await runOpenClaw(args, input, executable);
  assert.deepEqual(JSON.parse(result.stdout), { args, input });
  await assert.rejects(runOpenClaw(['fail'], undefined, executable), /official failure/);
});

test('Windows npm CLI resolution uses the public CLI entry, even when package.json is not exported', (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, 'openclaw.cmd'), '@echo off');
  const pkg = path.join(root, 'node_modules', 'openclaw');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'openclaw', exports: { './cli-entry': './openclaw.mjs' } }));
  fs.writeFileSync(path.join(pkg, 'openclaw.mjs'), '');
  assert.deepEqual(resolveOpenClaw({ PATH: root }, 'win32'), { command: process.execPath, prefix: [path.join(pkg, 'openclaw.mjs')] });
});

test('help and invalid flags never enter bot QR/install or call OpenClaw', async () => {
  const cli = mock();
  assert.equal(await runGuidanceCli(['--help'], output(), cli), 0);
  assert.equal(await runGuidanceCli(['setup', '--force'], output(), cli), 1);
  assert.deepEqual(cli.calls, []);
  const main = fileURLToPath(new URL('../../bin/dingtalk-connector.js', import.meta.url));
  const child = spawnSync(process.execPath, [main, 'guidance', '--help'], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  assert.match(child.stdout, /--overwrite-rules/);
  assert.doesNotMatch(child.stdout, /Scan with DingTalk|Authorization URL/);
});
