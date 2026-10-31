/** Setup only: the official agent-guidance plugin owns loading and prompt injection. */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { provisionRules, ruleNames, rulesDirectory } from './guidance-files.js';
import { openclaw } from './guidance-openclaw.js';

const unique = (values) => [...new Set(values)];
const sameAgents = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

export async function setupGuidance(options, cli = openclaw, io = console) {
  const plugins = await cli.plugins();
  if (plugins.enabled === false || plugins.deny?.includes('agent-guidance')) {
    throw new Error('OpenClaw plugin policy disables agent-guidance. Adjust that policy explicitly first.');
  }
  const previous = plugins.entries?.['agent-guidance']?.config;
  const directory = rulesDirectory(options.directory ?? previous?.directory);
  const agents = unique(options.agents ?? previous?.agents ?? []);
  if (!agents.length) throw new Error('First setup requires --agents <id[,id...]> for the intended Agent IDs.');
  if (previous && (path.resolve(previous.directory) !== directory || !sameAgents(previous.agents, agents))) {
    throw new Error('agent-guidance already uses another directory or Agent group. Adjust its configuration explicitly; setup will not broaden its scope.');
  }

  // Missing plugin/unsupported CLI fails before any file writes.
  await cli.inspect();
  const files = provisionRules(directory, { overwrite: options.overwriteRules });
  for (const file of files) io.log(`${file.status}: ${file.name}`);
  const names = ruleNames(directory);
  const prepend = unique(previous?.prepend ?? []).filter((name) => names.includes(name));
  const append = unique([...(previous?.append ?? []), ...names])
    .filter((name) => names.includes(name) && !prepend.includes(name));
  const patch = {
    plugins: {
      ...(plugins.allow?.length && !plugins.allow.includes('agent-guidance')
        ? { allow: [...plugins.allow, 'agent-guidance'] } : {}),
      entries: {
        'agent-guidance': {
          enabled: true,
          hooks: { allowConversationAccess: true, allowPromptInjection: true },
          config: { directory, agents, prepend, append },
        },
      },
    },
  };
  io.log('Configuring agent-guidance through OpenClaw...');
  await cli.patch(patch);
  io.log('Reloading agent-guidance...');
  const receipt = await cli.reload();
  for (const warning of receipt.warnings ?? []) io.error(warning);
  if (receipt.ok !== true || receipt.restartRequired !== false ||
      !receipt.runtime?.pluginIds?.includes('agent-guidance')) {
    throw new Error('OpenClaw did not confirm a completed agent-guidance reload. Check its runtime status; a Gateway restart may be required.');
  }
  io.log(`Reloaded agent-guidance: ${names.length} rules for ${agents.join(', ')} (generation ${receipt.runtime.generation}).`);
  return { directory, agents, files, prepend, append };
}

export async function runGuidanceCli(argv, io = console, cli = openclaw) {
  try {
    if (!argv.length || (argv.length === 1 && ['--help', '-h'].includes(argv[0]))) {
      io.log('Usage: dingtalk-connector guidance setup --directory <absolute-directory> --agents <id[,id...]> [--overwrite-rules]\nRepeat setup without directory/agents to reuse existing configuration.\nAll top-level .md files in that directory are rules. Existing files are skipped unless --overwrite-rules is supplied.');
      return 0;
    }
    if (argv[0] !== 'setup') throw new Error('Expected guidance setup; use guidance --help.');
    const { values } = parseArgs({ args: argv.slice(1), options: {
      directory: { type: 'string' }, agents: { type: 'string' },
      'overwrite-rules': { type: 'boolean', default: false },
    } });
    const agents = values.agents?.split(',').map((id) => id.trim());
    if (agents?.some((id) => !id)) throw new Error('--agents requires nonempty comma-separated Agent IDs.');
    await setupGuidance({ directory: values.directory, agents, overwriteRules: values['overwrite-rules'] }, cli, io);
    return 0;
  } catch (err) {
    io.error(`Guidance setup failed: ${err.message}`);
    io.error('Earlier file/config steps may have completed. Fix the reported issue and rerun setup; no automatic rollback or retry was performed.');
    return 1;
  }
}
