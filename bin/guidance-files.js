import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export const templatesDirectory = path.join(packageRoot, 'guidance', 'dingtalk');

function stat(filename) {
  try { return fs.lstatSync(filename); }
  catch (err) { if (err.code === 'ENOENT') return undefined; throw err; }
}

export function ruleNames(directory) {
  return fs.readdirSync(directory).filter((name) => name.endsWith('.md')).sort();
}

export function rulesDirectory(directory) {
  if (!directory || !path.isAbsolute(directory)) throw new Error('--directory must be an absolute path outside the connector installation.');
  const resolved = path.resolve(directory);
  const relative = path.relative(packageRoot, resolved);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
    throw new Error('Rules must live outside the connector installation so upgrades preserve edits.');
  }
  // Write safety, not a duplicate of the official rule loader's content checks.
  for (let current = resolved; ; current = path.dirname(current)) {
    const existing = stat(current);
    if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
      throw new Error('Cannot provision rules through a linked or non-directory path.');
    }
    if (path.dirname(current) === current) break;
  }
  return resolved;
}

export function provisionRules(directory, { overwrite = false, templates = templatesDirectory } = {}) {
  directory = rulesDirectory(directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return ruleNames(templates).map((name) => {
    const target = path.join(directory, name);
    const source = path.join(templates, name);
    try {
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      return { name, status: 'created' };
    } catch (err) { if (err.code !== 'EEXIST') throw err; }
    if (!overwrite) return { name, status: 'exists (skipped)' };
    const existing = fs.lstatSync(target);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1) {
      throw new Error(`Refusing to replace a linked or nonregular template destination: ${name}`);
    }
    // Replace the directory entry, never truncate through a link or a shared inode.
    const temporary = path.join(directory, `.guidance-${randomUUID()}.tmp`);
    try {
      fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, { force: true }); }
    return { name, status: 'replaced' };
  });
}
