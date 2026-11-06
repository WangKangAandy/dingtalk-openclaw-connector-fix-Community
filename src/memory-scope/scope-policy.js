/** Scope integration prerequisites, shared by setup and runtime. No sandbox/mount policy. */
export const NATIVE_SCOPE_TOOLS = Object.freeze([
  'memory_search', 'memory_get', 'memory_store', 'memory_forget', 'memory_recall', 'skill_workshop',
]);

/** Explicit replacement: never resolve a collision by plugin load order. @param {any} config */
export function scopedWorkshopSelected(config) {
  return config.meta?.migrations?.skillWorkshopPlugin === true
    && config.plugins?.entries?.['skill-workshop']?.enabled === false
    && config.plugins?.entries?.['dingtalk-scoped-workshop']?.enabled === true;
}

/** @param {any} config @param {string} agentId */
export function scopePolicyIssues(config, agentId) {
  const issues = [];
  const agent = config.agents?.entries?.[agentId];
  // 2026.10.9 memory-core has prompt hooks independent of search.enabled.
  if (config.plugins?.slots?.memory !== 'none') {
    issues.push('plugins.slots.memory must be "none": native memory-provider hooks are not scoped (Gateway-wide change)');
  }
  if (config.agents?.defaults?.compaction?.memoryFlush?.enabled !== false) {
    issues.push('agents.defaults.compaction.memoryFlush.enabled must be false: native flush writes unscoped memory (Gateway-wide change)');
  }
  if (config.hooks?.internal?.entries?.['session-memory']?.enabled !== false) {
    issues.push('hooks.internal.entries.session-memory.enabled must be false: native reset/rollover capture writes unscoped workspace memory (Gateway-wide change)');
  }
  const denied = new Set([...(config.tools?.deny ?? []), ...(agent?.tools?.deny ?? [])]);
  if (!denied.has('skill_workshop') && !scopedWorkshopSelected(config)) {
    issues.push(`agents.entries.${agentId}.tools.deny must include skill_workshop: exclude native learning for this Agent`);
  }
  return issues;
}

/** Relevant configuration revokes grants; unrelated mounts/models do not. @param {any} config */
export function scopeAuthorityConfig(config) {
  return {
    channel: config.channels?.['dingtalk-connector'],
    hooks: config.plugins?.entries?.['dingtalk-connector']?.hooks,
    internalHooks: config.hooks?.internal?.enabled,
    sessionMemoryHook: config.hooks?.internal?.entries?.['session-memory']?.enabled,
    memorySlot: config.plugins?.slots?.memory,
    flush: config.agents?.defaults?.compaction?.memoryFlush?.enabled,
    bindings: config.bindings,
    sessionStore: config.session?.store,
    globalDeny: config.tools?.deny,
    workshopPlugins: {
      migration: config.meta?.migrations?.skillWorkshopPlugin,
      native: config.plugins?.entries?.['skill-workshop']?.enabled,
      scoped: config.plugins?.entries?.['dingtalk-scoped-workshop']?.enabled,
    },
    agents: Object.fromEntries(Object.entries(config.agents?.entries ?? {}).map(([id, entry]) => {
      const agent = /** @type {any} */ (entry);
      return [id, { workspace: agent.workspace, agentDir: agent.agentDir, deny: agent.tools?.deny }];
    })),
    workspace: config.agents?.defaults?.workspace,
  };
}

/** @param {any} config @param {string | undefined} [agentId] */
export function scopeEnabled(config, agentId) {
  const scope = config.channels?.['dingtalk-connector']?.memoryScope;
  return scope?.enabled === true && (!agentId || !scope.agents || scope.agents.includes(agentId));
}

/** Routing text may select removal policy, never authorize a storage grant.
 * @param {any} config @param {{agentId?: string, sessionKey?: string}} context
 */
export function scopeContextSelected(config, context) {
  const agentId = context.agentId ?? /^agent:([^:]+):/.exec(context.sessionKey ?? '')?.[1];
  const selected = config.channels?.['dingtalk-connector']?.memoryScope?.agents;
  return !selected || (agentId !== undefined && selected.includes(agentId));
}
