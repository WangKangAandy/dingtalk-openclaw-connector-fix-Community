// Actual installed CLI/schema/SDK smoke; isolated config, no Gateway/Stream start.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { createScopeCli, setupScope } from '../../bin/scope-setup.js';

test('scope setup plan validates through real OpenClaw CLI without changing configuration', { timeout: 600_000 }, async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-host-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const cliEntry = createRequire(import.meta.url).resolve('openclaw/cli-entry');
  const configPath = path.join(root, 'openclaw.json');
  fs.mkdirSync(path.join(root, 'home'));
  const config = {
    gateway: { mode: 'local' },
    agents: { entries: { main: { workspace: path.join(root, 'workspace'), agentDir: path.join(root, 'agent') } } },
    plugins: { allow: ['dingtalk-connector'], load: { paths: [repo] }, slots: { memory: 'none' }, entries: { 'dingtalk-connector': { enabled: true } } },
    channels: { 'dingtalk-connector': { enabled: true, clientId: 'fixture-only', clientSecret: 'fixture-only' } },
  };
  const original = JSON.stringify(config); fs.writeFileSync(configPath, original);
  const calls = [];
  const run = (args, input) => new Promise((resolve, reject) => {
    calls.push(args);
    const child = execFile(process.execPath, [cliEntry, ...args], { windowsHide: true, timeout: 75_000,
      env: { ...process.env, HOME: path.join(root, 'home'), OPENCLAW_HOME: path.join(root, 'home'),
        OPENCLAW_STATE_DIR: path.join(root, 'state'), OPENCLAW_CONFIG_PATH: configPath, NO_COLOR: '1' },
      maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.message = `${args.join(' ')}: ${stderr || stdout || error.message}`; reject(error); }
      else resolve({ stdout, stderr });
    });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
  const output = [];
  const result = await setupScope({ agents: ['main'], learning: true }, createScopeCli(run), { log: s => output.push(s), error: s => output.push(s) });
  assert.equal(result.errors.length, 0);
  assert.ok(calls.some(args => args.includes('--dry-run')));
  assert.equal(calls.some(args => args.includes('reload')), false);
  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  assert.equal(output.join('').includes('fixture-only'), false);
});
