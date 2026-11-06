import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bindDwsArgvForExec } from '../../bin/dws-profile-args.mjs';
import { handleResolveExecEnv, handleBeforeToolCall } from '../../src/dws-exec-identity.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dws-shim-test-'));
const home = path.join(temporary, "home with spaces");
const fakeDir = path.join(temporary, 'official');
const fake = path.join(fakeDir, process.platform === 'win32' ? 'dws.exe' : 'dws');
const env = { ...process.env, HOME: home, USERPROFILE: home, DWS_BIN: fake };
const bound = sender => ({ ...env, OPENCLAW_SHELL: 'exec', ...handleResolveExecEnv({}, {
  messageProvider: 'dingtalk-connector', channelId: 'conversation-1',
  channelContext: { sender: { id: sender, corpId: 'dingA' } },
}) });
const run = (file, args, options = {}) => spawnSync(file, args, {
  encoding: 'utf8', timeout: 30000, windowsHide: true, ...options,
});
function ok(result) {
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim().split(/\r?\n/);
}
before(() => {
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(fakeDir);
  if (process.platform === 'win32') {
    // A real executable catches Windows spawn/argv errors that a JS-only mock misses.
    const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    const source = path.join(temporary, 'FakeDws.cs');
    fs.writeFileSync(source, 'class FakeDws { static void Main(string[] args) { foreach (var arg in args) System.Console.WriteLine(arg); } }');
    ok(run(compiler, ['/nologo', `/out:${fake}`, source]));
  } else {
    fs.writeFileSync(fake, '#!/usr/bin/env node\nfor (const arg of process.argv.slice(2)) console.log(arg);\n', { mode: 0o755 });
  }
  ok(run(process.execPath, [path.join(root, 'scripts/install-dws-profile-shim.js')], { env }));
});
after(() => fs.rmSync(temporary, { recursive: true, force: true }));

test('installed shim has its shared module and routes to the real executable with exact argv', () => {
  const shim = path.join(home, '.openclaw/bin/dws');
  assert.ok(fs.existsSync(path.join(home, '.openclaw/bin/dws-profile-args.mjs')));
  assert.deepEqual(ok(run(process.execPath, [shim, '--profile', 'dingB:bob', 'auth', 'status', '--profile=dingB:carol'],
    { env: bound('alice') })), ['--profile', 'dingA:alice', 'auth', 'status']);
  assert.deepEqual(ok(run(process.execPath, [shim, '-f', 'json', 'auth', 'login', '--device', '--profile=dingB:bob'],
    { env: bound('alice') })), ['-f', 'json', 'auth', 'login', '--device']);
});

test('installed shim fails closed with a stale inherited profile and missing tenant', () => {
  const shim = path.join(home, '.openclaw/bin/dws');
  const result = run(process.execPath, [shim, 'auth', 'status'], {
    env: { ...bound('alice'), OPENCLAW_DINGTALK_CORP_ID: '' },
  });
  assert.equal(result.status, 78);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /missing trusted DingTalk corpId and senderStaffId/);
});

test('native shell wrapper resolves the installed shim under a home path containing spaces', () => {
  const moduleUrl = pathToFileURL(path.join(root, 'src/dws-exec-identity.ts')).href;
  const generate = `import { prefixExecCommandWithDwsShim } from ${JSON.stringify(moduleUrl)}; process.stdout.write(prefixExecCommandWithDwsShim('dws auth status --format json'));`;
  const prepared = run(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', generate], { env });
  assert.equal(prepared.status, 0, prepared.stderr);
  const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', prepared.stdout] : ['-c', prepared.stdout];
  assert.deepEqual(ok(run(shell, args, { env: bound('alice') })), ['--profile', 'dingA:alice', 'auth', 'status', '--format', 'json']);
});

test('caller profile options, short login flags and payload arguments stay distinct', () => {
  const current = bound('alice');
  assert.deepEqual(bindDwsArgvForExec(['auth', '--format', 'json', 'login', '--profile=dingB:bob'], current),
    { argv: ['auth', '--format', 'json', 'login'] });
  assert.deepEqual(bindDwsArgvForExec(['--jq', '--profile', 'doc', '--', '--profile=bob'], current),
    { argv: ['--profile', 'dingA:alice', '--jq', '--profile', 'doc', '--', '--profile=bob'] });
  assert.deepEqual(handleResolveExecEnv({}, { messageProvider: 'slack', channelContext: { sender: { id: 'alice', corpId: 'dingA' } } }), {});
  assert.equal(handleBeforeToolCall({ toolName: 'exec', params: { command: 'dws auth status' } }, { messageProvider: 'slack' }), undefined);
});
