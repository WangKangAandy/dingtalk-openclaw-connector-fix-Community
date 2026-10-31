import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { guidanceFile, runGuidanceCli, GUIDANCE_FILENAME } from '../../bin/agent-guidance.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(root, 'bin', 'dingtalk-connector.js');
const template = fs.readFileSync(path.join(root, 'guidance', GUIDANCE_FILENAME));

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'connector-guidance-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, GUIDANCE_FILENAME) };
}

function makeLink(t, target, link, type = 'file') {
  try { fs.symlinkSync(target, link, type); return true; }
  catch (err) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(err.code)) {
      t.skip('Windows account cannot create symlinks; Linux CI exercises this case.');
      return false;
    }
    throw err;
  }
}

test('init creates external UTF-8 rules; repeating init preserves file identity and mtime', (t) => {
  const { directory, file } = fixture(t);
  assert.ok(template.length < 16 * 1024);
  assert.equal(guidanceFile('init', directory).status, 'created');
  fs.utimesSync(file, new Date(0), new Date(0));
  const before = fs.statSync(file);
  assert.deepEqual(fs.readFileSync(file), template);
  const again = guidanceFile('init', directory);
  assert.equal(again.status, 'unchanged');
  assert.equal(again.sha256, again.templateSha256);
  assert.equal(again.activation, 'not-checked');
  assert.equal(fs.statSync(file).mtimeMs, before.mtimeMs);
  assert.equal(fs.statSync(file).ino, before.ino);
});

test('different edits and older templates are preserved without backup/merge side effects', (t) => {
  const { directory, file } = fixture(t);
  const custom = Buffer.from('# 我自己的规则\n不要覆盖\n');
  fs.writeFileSync(file, custom);
  fs.utimesSync(file, new Date(0), new Date(0));
  for (const action of ['init', 'check']) {
    const result = guidanceFile(action, directory);
    assert.equal(result.status, 'different');
    assert.notEqual(result.sha256, result.templateSha256);
    assert.deepEqual(fs.readFileSync(file), custom);
    assert.equal(fs.statSync(file).mtimeMs, 0);
  }
  assert.deepEqual(fs.readdirSync(directory), [GUIDANCE_FILENAME]);
});

test('check of a missing directory is read-only; init can create nested directories', (t) => {
  const { directory } = fixture(t);
  const nested = path.join(directory, 'new', 'rules');
  assert.equal(guidanceFile('check', nested).status, 'missing');
  assert.equal(fs.existsSync(nested), false);
  assert.equal(guidanceFile('init', nested).status, 'created');
});

for (const [name, bytes] of [
  ['empty', Buffer.alloc(0)], ['blank', Buffer.from(' \n\t')],
  ['invalid UTF-8', Buffer.from([0xc3, 0x28])], ['NUL', Buffer.from('rule\0text')],
  ['over limit', Buffer.alloc(16 * 1024 + 1, 'a')],
]) {
  test(`invalid existing ${name} is reported and left intact`, (t) => {
    const { directory, file } = fixture(t);
    fs.writeFileSync(file, bytes);
    assert.throws(() => guidanceFile('init', directory));
    assert.throws(() => guidanceFile('check', directory));
    assert.deepEqual(fs.readFileSync(file), bytes);
  });
}

test('exactly the official 16 KiB single-file limit is accepted', (t) => {
  const { directory, file } = fixture(t);
  fs.writeFileSync(file, Buffer.alloc(16 * 1024, 'a'));
  assert.equal(guidanceFile('check', directory).status, 'different');
});

test('directory occupying the file path is not replaced', (t) => {
  const { directory, file } = fixture(t);
  fs.mkdirSync(file);
  assert.throws(() => guidanceFile('init', directory), /regular file/);
  assert.ok(fs.statSync(file).isDirectory());
});

test('existing and dangling file symlinks are rejected without changing their targets', (t) => {
  const { directory, file } = fixture(t);
  const target = path.join(directory, 'original.md');
  fs.writeFileSync(target, 'original');
  if (!makeLink(t, target, file)) return;
  assert.throws(() => guidanceFile('init', directory), /regular file/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'original');
  fs.unlinkSync(target);
  assert.throws(() => guidanceFile('init', directory), /regular file/);
  assert.ok(fs.lstatSync(file).isSymbolicLink());
});

test('hardlinked files are rejected to match agent-guidance', (t) => {
  const { directory, file } = fixture(t);
  const target = path.join(directory, 'original.md');
  fs.writeFileSync(target, 'original');
  fs.linkSync(target, file);
  assert.throws(() => guidanceFile('init', directory), /hard links/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'original');
});

test('symlinked directories and ancestors are rejected, including missing children', (t) => {
  const { directory } = fixture(t);
  const target = path.join(directory, 'real');
  const linked = path.join(directory, 'linked');
  fs.mkdirSync(target);
  if (!makeLink(t, target, linked, process.platform === 'win32' ? 'junction' : 'dir')) return;
  assert.throws(() => guidanceFile('init', linked), /real directories/);
  assert.throws(() => guidanceFile('init', path.join(linked, 'new')), /real directories/);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('requires an external absolute directory and rejects a non-directory ancestor', (t) => {
  assert.throws(() => guidanceFile('init', 'relative'), /absolute/);
  assert.throws(() => guidanceFile('init', root), /outside/);
  assert.throws(() => guidanceFile('init', path.join(root, 'guidance')), /outside/);
  const { directory } = fixture(t);
  const parent = path.join(directory, 'not-a-directory');
  fs.writeFileSync(parent, 'keep');
  assert.throws(() => guidanceFile('init', path.join(parent, 'child')));
  assert.equal(fs.readFileSync(parent, 'utf8'), 'keep');
});

test('read-only files can be checked/preserved and permission failures are surfaced', (t) => {
  const { directory, file } = fixture(t);
  fs.writeFileSync(file, 'custom', { mode: 0o400 });
  assert.equal(guidanceFile('init', directory).status, 'different');
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    fs.chmodSync(file, 0);
    try { assert.throws(() => guidanceFile('check', directory), /EACCES/); }
    finally { fs.chmodSync(file, 0o600); }
  } else { fs.chmodSync(file, 0o600); }
});

test('CLI refuses destructive/unknown options before creating a directory', (t) => {
  const { directory } = fixture(t);
  const target = path.join(directory, 'missing');
  const io = { log() {}, error() {} };
  assert.equal(runGuidanceCli(['init', '--directory', target, '--force'], io), 1);
  assert.equal(runGuidanceCli(['init', '--directory'], io), 1);
  assert.equal(runGuidanceCli(['update', '--directory', target], io), 1);
  assert.equal(fs.existsSync(target), false);
});

test('real CLI template/init/check never enter installer or mutate OpenClaw config', (t) => {
  const { directory } = fixture(t);
  const fakeHome = path.join(directory, 'home');
  const configDir = path.join(fakeHome, '.openclaw');
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, 'openclaw.json');
  const config = '{"plugins":{"entries":{"agent-guidance":{"enabled":false}}}}';
  fs.writeFileSync(configPath, config);
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, DINGTALK_REGISTRATION_BASE_URL: 'http://127.0.0.1:1' };
  const invoke = (args) => spawnSync(process.execPath, [cli, 'guidance', ...args], { encoding: 'utf8', env, timeout: 10000 });
  const printed = invoke(['template']);
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout.trim(), template.toString('utf8').trim());
  const target = path.join(directory, 'rules with spaces');
  const missing = invoke(['check', '--directory', target]);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).status, 'missing');
  const created = invoke(['init', '--directory', target]);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).status, 'created');
  assert.equal(fs.readFileSync(configPath, 'utf8'), config);
  assert.deepEqual(fs.readdirSync(fakeHome), ['.openclaw']);
  assert.deepEqual(fs.readdirSync(configDir), ['openclaw.json']);
});

test('concurrent initializers cannot overwrite a competing file', async (t) => {
  const { directory, file } = fixture(t);
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'guidance', 'init', '--directory', directory]);
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const results = await Promise.all(Array.from({ length: 5 }, run));
  assert.equal(results.filter((r) => r.code === 0 && JSON.parse(r.stdout).status === 'created').length, 1);
  for (const result of results) {
    // A concurrent reader can observe valid partial text and preserve it as different.
    if (result.code === 0) assert.ok(['created', 'unchanged', 'different'].includes(JSON.parse(result.stdout).status));
    else assert.match(result.stderr, /nonempty|utf-8/i); // Only a still-being-created file may be rejected.
  }
  assert.deepEqual(fs.readFileSync(file), template);
  assert.equal(fs.statSync(file).nlink, 1);
});

test('package includes the provider, template and operator guide', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const entry of ['bin/', 'guidance/', 'docs/*.md']) assert.ok(pkg.files.includes(entry));
});
