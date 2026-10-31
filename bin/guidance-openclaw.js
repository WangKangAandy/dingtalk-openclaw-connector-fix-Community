/** Keep OpenClaw configuration and lifecycle semantics in the official CLI. */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export function resolveOpenClaw(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return { command: 'openclaw', prefix: [] };
  // Node cannot exec a Windows npm .cmd shim without a shell. Resolve its package
  // entry instead, so user paths/JSON never pass through cmd.exe quoting.
  for (const directory of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    if (!fs.existsSync(path.join(directory, 'openclaw.cmd'))) continue;
    try {
      const entry = createRequire(path.join(directory, '__guidance__.cjs')).resolve('openclaw/cli-entry');
      return { command: process.execPath, prefix: [entry] };
    } catch { /* A different PATH entry may contain the installed npm package. */ }
  }
  throw new Error('Cannot locate the OpenClaw npm CLI on PATH. Run setup in the Gateway installation environment.');
}

export function runOpenClaw(args, input, executable = resolveOpenClaw()) {
  const timeout = args[1] === 'reload' ? 660_000 : args[1] === 'patch' ? 120_000 : 60_000;
  return new Promise((resolve, reject) => {
    const child = execFile(executable.command, [...executable.prefix, ...args], {
      encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = error.killed && error.signal === 'SIGTERM'
          ? `timed out after ${timeout / 1000}s; check OpenClaw status before retrying`
          : error.message;
        const failure = new Error(`openclaw ${args.slice(0, 2).join(' ')}: ${stderr.trim() || stdout.trim() || detail}`);
        failure.stdout = stdout;
        reject(failure);
      } else resolve({ stdout, stderr });
    });
    child.stdin.on('error', () => {}); // The process error above owns early exits.
    child.stdin.end(input);
  });
}

export function createOpenClaw(run = runOpenClaw, io = console) {
  return {
    async plugins() {
      try { return JSON.parse((await run(['config', 'get', 'plugins', '--json'])).stdout); }
      catch (err) {
        let result;
        try { result = JSON.parse(err.stdout); } catch { /* Preserve original error. */ }
        if (result?.ok === false && result.error?.message?.startsWith('Config path is valid but unset: plugins.')) return {};
        throw err;
      }
    },
    async inspect() { await run(['plugins', 'inspect', 'agent-guidance', '--json']); },
    async patch(value) {
      const { stdout, stderr } = await run(['config', 'patch', '--stdin'], JSON.stringify(value));
      if (stdout.trim()) io.log(stdout.trim());
      if (stderr.trim()) io.error(stderr.trim());
    },
    async reload() {
      const { stdout, stderr } = await run(['plugins', 'reload', 'agent-guidance', '--wait', '--json']);
      if (stderr.trim()) io.error(stderr.trim());
      return JSON.parse(stdout);
    },
  };
}

export const openclaw = createOpenClaw();
