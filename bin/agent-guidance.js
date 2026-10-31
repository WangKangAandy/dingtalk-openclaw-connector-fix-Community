/** File provisioning only. OpenClaw's agent-guidance owns prompt injection/reload. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(packageRoot, 'guidance', 'dws-openclaw.md');
export const GUIDANCE_FILENAME = 'dws-openclaw.md';
// Match agent-guidance's per-file limit; its combined-file limit is checked by OpenClaw.
const MAX_BYTES = 16 * 1024;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function statOrMissing(filename) {
  try { return fs.lstatSync(filename); }
  catch (err) { if (err.code === 'ENOENT') return undefined; throw err; }
}

function validateText(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error('Rule file exceeds 16 KiB.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.trim() || text.includes('\0')) throw new Error('Rule file must be nonempty UTF-8 text without NUL.');
  return bytes;
}

function readRule(filename) {
  const before = fs.lstatSync(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw new Error('Rule file must be a regular file without symbolic or hard links.');
  }
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error('Rule file changed while opening; retry after editing finishes.');
    }
    // Bounded read even when another process grows the file after stat().
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    return validateText(bytes.subarray(0, length));
  } finally { fs.closeSync(fd); }
}

function validateDirectory(directory) {
  if (!directory || !path.isAbsolute(directory)) throw new Error('--directory must be an absolute path.');
  const resolved = path.resolve(directory);
  const relative = path.relative(packageRoot, resolved);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
    throw new Error('Choose a directory outside the connector installation so upgrades cannot replace edits.');
  }
  // agent-guidance rejects symlinked ancestors, including directory junctions.
  for (let current = resolved; ; current = path.dirname(current)) {
    const stat = statOrMissing(current);
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw new Error('Rule directory and all existing ancestors must be real directories, not links.');
    }
    if (path.dirname(current) === current) break;
  }
  return resolved;
}

export function guidanceFile(action, directory) {
  if (action !== 'init' && action !== 'check') throw new Error('Expected init or check.');
  const resolved = validateDirectory(directory);
  const filename = path.join(resolved, GUIDANCE_FILENAME);
  const template = readRule(templatePath);
  const result = (status, current) => ({
    status,
    path: filename,
    templateSha256: hash(template),
    ...(current ? { sha256: hash(current) } : {}),
    activation: 'not-checked',
  });
  const existing = () => {
    const bytes = readRule(filename);
    return result(bytes.equals(template) ? 'unchanged' : 'different', bytes);
  };
  if (statOrMissing(filename)) return existing();
  if (action === 'check') return result('missing');

  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  validateDirectory(resolved);
  let fd;
  try { fd = fs.openSync(filename, 'wx', 0o600); }
  catch (err) {
    // A concurrent initializer/editor won. Inspect it, never replace it.
    if (err.code === 'EEXIST') return existing();
    throw err;
  }
  // Init is explicitly completed before configuring/reloading agent-guidance.
  // On write failure leave the file visible for diagnosis; never retry by overwriting it.
  try {
    fs.writeFileSync(fd, template);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  return result('created', template);
}

export function runGuidanceCli(argv, io = console) {
  try {
    if (argv.length === 0 || (argv.length === 1 && ['--help', '-h'].includes(argv[0]))) {
      io.log('Usage: dingtalk-connector guidance init|check --directory <absolute-directory>\n       dingtalk-connector guidance template\nExisting files are never overwritten. Configure/reload OpenClaw agent-guidance separately.');
      return 0;
    }
    if (argv.length === 1 && argv[0] === 'template') {
      // No secrets/config/network access, and no destination side effects.
      io.log(readRule(templatePath).toString('utf8').trimEnd());
      return 0;
    }
    if (argv.length !== 3 || !['init', 'check'].includes(argv[0]) || argv[1] !== '--directory') {
      throw new Error('Use guidance init|check --directory <absolute-directory>, or guidance template.');
    }
    const result = guidanceFile(argv[0], argv[2]);
    io.log(JSON.stringify(result, null, 2));
    if (result.status === 'different') {
      io.error('Existing rules preserved. Compare with guidance template and merge intentionally; no automatic update.');
    }
    io.error('File provisioning only: configuration and loaded rules were not checked. After review, reload agent-guidance.');
    return result.status === 'missing' ? 1 : 0;
  } catch (err) {
    io.error(`Guidance error: ${err.message}`);
    return 1;
  }
}
