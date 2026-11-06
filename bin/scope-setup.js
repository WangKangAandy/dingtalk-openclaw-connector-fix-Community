import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { runOpenClaw } from './guidance-openclaw.js';
import { scopePolicyIssues, scopedWorkshopSelected } from '../src/memory-scope/scope-policy.js';

const ID = 'dingtalk-connector';
const unique = values => [...new Set(values)];
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

/** Planning is pure and never returns secrets or rewrites whole config objects. */
export function planScope(config, options) {
  const scope = config.channels?.[ID]?.memoryScope ?? {};
  const replacement = scopedWorkshopSelected(config);
  const agents = unique(options.agents ?? scope.agents ?? []);
  if (!agents.length || agents.some(id => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))) {
    throw new Error('Specify canonical target Agent IDs with --agents <id[,id...]>; no Agent is selected implicitly.');
  }
  const errors = [], warnings = [], globalChanges = [];
  const channel = config.channels?.[ID];
  if (options.learning && !replacement) errors.push("Migrate Skill Workshop plugin policy, explicitly disable skill-workshop, and enable dingtalk-scoped-workshop first. Connector setup does not install or schedule learning plugins.");
  if (!plain(channel) || channel.enabled === false) errors.push('Configure and enable the DingTalk channel first.');
  if (config.plugins?.enabled === false || config.plugins?.deny?.includes(ID)
      || config.plugins?.entries?.[ID]?.enabled === false
      || (config.plugins?.allow?.length && !config.plugins.allow.includes(ID))) {
    errors.push('Plugin policy disables/excludes dingtalk-connector; setup will not override it.');
  }
  if (config.hooks?.internal?.enabled === false) errors.push('Internal hooks are explicitly disabled; enable them through the managed OpenClaw configuration first.');
  const hooks = config.plugins?.entries?.[ID]?.hooks ?? {};
  if (hooks.allowConversationAccess === false || hooks.allowPromptModification === false) {
    errors.push('Connector hook access is explicitly denied; setup will not override that denial.');
  }
  if (scope.agents?.length && agents.some(id => !scope.agents.includes(id))) {
    warnings.push('The selected Agent set expands the existing scope configuration. Other channels using these Agents share the Agent-level tool policy.');
  }
  const channelPolicies = [channel, ...Object.values(channel?.accounts ?? {})].filter(Boolean);
  if (channelPolicies.some(p => p.sharedMemoryAcrossConversations === true || p.groupSessionScope === 'group_sender')) {
    errors.push('Current channel routing conflicts with private-user/shared-group scope. Resolve sharedMemoryAcrossConversations/groupSessionScope explicitly first.');
  }
  const entries = {};
  const issues = [];
  if (hooks.allowConversationAccess !== true || hooks.allowPromptModification !== true) issues.push('Required connector hook permissions are not enabled.');
  for (const agentId of agents) {
    const agent = config.agents?.entries?.[agentId];
    if (!agent && (agentId !== 'main' || Object.keys(config.agents?.entries ?? {}).length)) {
      errors.push(`Agent ${agentId} does not exist; setup does not create Agents or change channel bindings.`);
      continue;
    }
    if (agent?.runtime?.type === 'acp') errors.push(`Agent ${agentId} uses ACP; this integration requires builtin scope bindings and lifecycle.`);
    issues.push(...scopePolicyIssues(config, agentId));
    const required = ['scoped_memory', ...(replacement ? ['skill_workshop'] : [])];
    for (const tool of required) {
      if ([...(config.tools?.deny ?? []), ...(agent?.tools?.deny ?? [])].includes(tool)) {
        errors.push(`${agentId}: ${tool} is explicitly denied; setup will not override it.`);
      }
    }
    // Also-allow is deliberately not added: it could override a bounded operator allowlist.
    warnings.push(`${agentId}: existing tool profiles/allowlists remain unchanged; verify that required scoped tools are available in the real turn.`);
    if (!replacement && ![...(config.tools?.deny ?? []), ...(agent?.tools?.deny ?? [])].includes('skill_workshop')) {
      entries[agentId] = { tools: { deny: unique([...(agent?.tools?.deny ?? []), 'skill_workshop']) } };
    }
  }
  const patch = { channels: { [ID]: { memoryScope: { enabled: true, agents } } } };
  if (Object.keys(entries).length) patch.agents = { entries };
  if (config.plugins?.slots?.memory !== 'none') {
    globalChanges.push('Disable the native memory slot for the entire Gateway (including other Agents/channels). Scoped memory remains available.');
    patch.plugins = { slots: { memory: 'none' } };
  }
  if (config.agents?.defaults?.compaction?.memoryFlush?.enabled !== false) {
    globalChanges.push('Disable native pre-compaction memory flush for every Agent; ordinary compaction remains enabled.');
    patch.agents = { ...patch.agents, defaults: { compaction: { memoryFlush: { enabled: false } } } };
  }
  if (config.hooks?.internal?.entries?.['session-memory']?.enabled !== false) {
    globalChanges.push('Disable the native session-memory reset/rollover hook for the entire Gateway; it otherwise copies conversations into shared workspace memory.');
    patch.hooks = { internal: { entries: { 'session-memory': { enabled: false } } } };
  }
  if (hooks.allowConversationAccess !== true || hooks.allowPromptModification !== true) {
    patch.plugins = { ...patch.plugins, entries: { [ID]: { hooks: { allowConversationAccess: true, allowPromptModification: true } } } };
  }
  warnings.push('Sandbox, mounts, exec, sessions, credentials, public files and global autonomous learning are not changed. Filesystem isolation remains an OpenClaw deployment responsibility.');
  return { agents, patch, errors, warnings, globalChanges, currentIssues: unique(issues),
    enabled: scope.enabled === true && (!scope.agents || agents.every(id => scope.agents.includes(id))),
    learning: replacement };
}

export function createScopeCli(run = runOpenClaw) {
  return {
    async read() {
      const config = {};
      for (const key of ['agents', 'plugins', 'hooks', 'tools', 'channels.dingtalk-connector', 'session', 'skills']) {
        let value;
        try { value = JSON.parse((await run(['config', 'get', key, '--json'])).stdout); }
        catch (error) {
          let result; try { result = JSON.parse(error.stdout); } catch { /* preserve failure */ }
          if (result?.ok !== false || !result.error?.message?.startsWith(`Config path is valid but unset: ${key}`)) {
            // config get may have emitted credentials before a timeout/error.
            // Do not include stdout or the CLI runner's raw error in diagnostics.
            throw new Error(`Could not read OpenClaw config ${key}; command failed or timed out. Check the installed CLI in the Gateway environment. No configuration was written.`);
          }
          continue;
        }
        if (key.startsWith('channels.')) config.channels = { [ID]: value };
        else config[key] = value;
      }
      return config;
    },
    async inspect() { return JSON.parse((await run(['plugins', 'inspect', ID, '--json'])).stdout); },
    async inspectAgent(config, id) {
      // Resolve paths via the installed public SDK, never by guessing ~/.openclaw.
      const { resolveAgentDir, resolveAgentWorkspaceDir } = await import('openclaw/plugin-sdk/agent-runtime');
      const directory = path.join(resolveAgentDir(config, id), 'workshop-skills');
      const workspace = resolveAgentWorkspaceDir(config, id);
      return { learnedFiles: fs.existsSync(directory) && fs.readdirSync(directory).length > 0,
        sharedProfile: fs.existsSync(path.join(workspace, 'USER.md')),
        sharedMemory: fs.existsSync(path.join(workspace, 'MEMORY.md')) };
    },
    async validate(patch) { await run(['config', 'patch', '--stdin', '--dry-run'], JSON.stringify(patch)); },
    async patch(patch) { await run(['config', 'patch', '--stdin'], JSON.stringify(patch)); },
    async reload() { return JSON.parse((await run(['plugins', 'reload', ID, '--wait', '--json'])).stdout); },
  };
}

export async function setupScope(options, cli = createScopeCli(), io = console) {
  const config = await cli.read();
  await cli.inspect();
  const plan = planScope(config, options);
  for (const id of plan.agents) {
    const files = await cli.inspectAgent(config, id);
    if (files.learnedFiles) plan.errors.push(`${id}: existing workshop-skills can be auto-discovered. Explicitly migrate them or publish reviewed public skills elsewhere; setup never moves/deletes data.`);
    if (files.sharedProfile || files.sharedMemory) plan.warnings.push(`${id}: existing USER.md/MEMORY.md is excluded from scoped prompt bootstrap, but ordinary file access remains governed by your host policy. No file is deleted or migrated.`);
  }
  // The plan contains only paths/booleans/tool names, never application/model secrets.
  io.log(JSON.stringify(plan, null, 2));
  if (plan.errors.length) throw new Error('Scope setup blocked by the reported conflicts; no configuration was written.');
  await cli.validate(plan.patch);
  if (!options.apply) {
    io.log('Plan validated; no writes/reload. Use --apply to enable. Global changes also require --accept-global-memory-changes.');
    return plan;
  }
  if (plan.globalChanges.length && !options.acceptGlobalMemoryChanges) {
    throw new Error('Gateway-wide memory changes need --accept-global-memory-changes. Other Agents/channels are affected; no writes were made.');
  }
  // Avoid publishing stale array merges after an administrator edited policy.
  // CLI patch owns the write; do not replace/redact/rewrite the entire config.
  if (JSON.stringify(await cli.read()) !== JSON.stringify(config)) throw new Error('Configuration changed during setup; rerun to review a fresh plan.');
  await cli.patch(plan.patch);
  const after = await cli.read();
  const issues = plan.agents.flatMap(id => scopePolicyIssues(after, id));
  const saved = after.channels?.[ID]?.memoryScope;
  const savedHooks = after.plugins?.entries?.[ID]?.hooks;
  if (saved?.enabled !== true || JSON.stringify(saved.agents) !== JSON.stringify(plan.agents)
      || (options.learning === true && !scopedWorkshopSelected(after))
      || savedHooks?.allowConversationAccess !== true || savedHooks?.allowPromptModification !== true || issues.length) {
    throw new Error('Saved scope configuration does not satisfy the plan; inspect OpenClaw configuration.');
  }
  // A connector-only reload cannot attest changes to other plugin slots or
  // internal hooks. It also races the host's file-triggered config activation.
  // Leave the required full restart to the operator, without claiming activation.
  if (plan.globalChanges.length) {
    io.log('Configuration saved and verified. Gateway-wide memory settings changed: restart the Gateway, then run scope check and a real DingTalk test. Connector-only reload was not requested; activation is not confirmed.');
    return { ...plan, activation: 'restart-required' };
  }
  const receipt = await cli.reload();
  if (receipt.ok !== true || typeof receipt.restartRequired !== 'boolean' || !receipt.runtime?.pluginIds?.includes(ID)) {
    throw new Error('Configuration may be saved, but OpenClaw did not confirm connector reload. Inspect status; setup will not retry or roll back other administrator changes.');
  }
  for (const warning of receipt.warnings ?? []) io.error(warning);
  io.log(receipt.restartRequired
    ? 'Configuration saved; OpenClaw requires a Gateway restart. Setup did not restart it. Run scope check after restart, then verify a real DingTalk turn.'
    : 'Configuration saved and connector reload confirmed. A real DingTalk memory/learning smoke test is still required.');
  return { ...plan, receipt };
}

export async function runScopeCli(argv, io = console, cli = createScopeCli()) {
  try {
    if (!argv.length || argv.includes('--help')) {
      io.log('Usage: dingtalk-connector scope check --agents <id[,id...]>\n       dingtalk-connector scope setup --agents <id[,id...]> [--learning] [--apply] [--accept-global-memory-changes]\nsetup defaults to a read-only plan. No installation/message handler changes host configuration. See docs/scoped-setup.md.');
      return 0;
    }
    if (!['setup', 'check'].includes(argv[0])) throw new Error('Expected scope setup or scope check.');
    const { values } = parseArgs({ args: argv.slice(1), options: {
      agents: { type: 'string' }, learning: { type: 'boolean' }, apply: { type: 'boolean' },
      'accept-global-memory-changes': { type: 'boolean' },
    } });
    if (argv[0] === 'check' && (values.apply || values.learning !== undefined || values['accept-global-memory-changes'])) {
      throw new Error('scope check is read-only; use setup to propose changes.');
    }
    const plan = await setupScope({ agents: values.agents?.split(',').map(id => id.trim()), learning: values.learning,
      apply: argv[0] === 'setup' && values.apply, acceptGlobalMemoryChanges: values['accept-global-memory-changes'] }, cli, io);
    if (argv[0] === 'check' && (!plan.enabled || plan.currentIssues.length)) return 1;
    return 0;
  } catch (error) { io.error(error.message); return 1; }
}
