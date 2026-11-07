import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHardScopeRuntime, getHardScopeRuntime } from '../../src/memory-scope/hard-runtime.ts'
import { registerMemoryScope, stripUnscopedMemory } from '../../src/memory-scope/register.ts'
import { assertScopeGrant } from '../../src/memory-scope/authority.ts'
import { assertBuiltinScopeRuntime } from '../../src/memory-scope/runtime-policy.ts'

vi.mock('openclaw/plugin-sdk/agent-scope-runtime', () => ({ resolveAgentDir: (cfg: any) => cfg.agentDir }))

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-runtime-')); roots.push(root)
  const cfg: any = {
    agentDir: root,
    hooks: { internal: { entries: { "session-memory": { enabled: false } } } },
    tools: { deny: ["skill_workshop"] },
    channels: { 'dingtalk-connector': { memoryScope: { enabled: true } } },
    plugins: { slots: { memory: 'none' }, entries: { 'dingtalk-connector': { hooks: { allowConversationAccess: true } } } },
    memory: { search: { enabled: false } },
    agents: { defaults: { skipOptionalBootstrapFiles: ['USER.md'], compaction: { memoryFlush: { enabled: false } } } },
    skills: { workshop: { autonomous: { mode: 'off' } } },
  }
  const hooks = new Map<string, Function>()
  const sandbox = vi.fn(() => ({ sandboxed: true, workspaceAccess: 'none' }))
  const api: any = { id: 'dingtalk-connector', config: cfg, logger: { info: vi.fn() },
    runtime: { config: { current: () => cfg }, state: { resolveStateDir: () => root },
      sandbox: { resolveWorkspaceAuthority: sandbox },
      agent: { resolveCliBackendDispatchEligibility: vi.fn(() => undefined), resolveAgentWorkspaceDir: () => root, session: { resolveStorePath: () => path.join(root, 'sessions.sqlite'),
        getSessionEntry: () => undefined, runWithWorkAdmission: vi.fn() } } },
    registerTool: vi.fn(), registerHook: vi.fn((name, fn) => hooks.set(name, fn)),
    on: vi.fn((name, fn) => hooks.set(name, fn)),
  }
  const input = { tenantId: 'Corp', accountId: 'Bot', agentId: 'main', senderId: 'Alice', conversationId: 'DM', chatType: 'direct' as const }
  return { root, cfg, api, input, hooks, sandbox }
}

describe('hard scope registration and admission boundary', () => {
  it('refuses missing scope bindings independently of sandbox configuration', () => {
    const f = fixture(); registerMemoryScope(f.api)
    const gate = f.hooks.get('before_agent_run')!
    const context = { agentId: 'main', sessionKey: 'agent:main:dingtalk-connector:direct:test', channel: 'dingtalk-connector' }
    for (const sandboxed of [undefined, false]) {
      expect(gate({}, { ...context, sandboxed })).toMatchObject({ outcome: 'block', message: expect.stringContaining('Scoped memory refused') })
    }
    // Sandbox evidence alone cannot supply the missing foreground identity.
    expect(gate({}, { ...context, sandboxed: true })).toMatchObject({ outcome: 'block' })
    expect(gate({}, { channel: 'other' })).toBeUndefined()
    f.hooks.get('gateway_stop')!()
  })
  it('admits a bound foreground run without sandbox evidence and rejects revoked authority', () => {
    const f = fixture()
    f.api.runtime.agent.session.getSessionEntry = () => ({ sessionId: 'current', lifecycleRevision: 'generation' })
    registerMemoryScope(f.api)
    const admitted = getHardScopeRuntime().admit(f.input, () => ({}))
    const ctx = { sandboxed: false, agentId: 'main', sessionKey: admitted.sessionKey, sessionId: 'current',
      channel: 'dingtalk-connector', accountId: 'Bot', senderId: 'Alice', channelContext: admitted.context.ChannelContext }
    const gate = f.hooks.get('before_agent_run')!
    expect(gate({}, ctx)).toBeUndefined()
    getHardScopeRuntime().services.admissions.release(admitted.token)
    expect(gate({}, ctx)).toMatchObject({ outcome: 'block' })
    f.hooks.get('gateway_stop')!()
  })
  it.each(['none', 'ro', 'rw'])('does not gate workspaceAccess=%s, binds, exec or ordinary tools', workspaceAccess => {
    const f = fixture()
    f.cfg.agents.defaults.sandbox = { mode: 'all', scope: 'session', workspaceAccess, docker: { binds: ['/docs:/knowledge:ro'] } }
    f.cfg.tools.exec = { host: 'gateway' }
    f.cfg.tools.allow = ['read', 'exec', 'custom_plugin', 'scoped_memory']
    const runtime = createHardScopeRuntime(f.api)
    expect(runtime.admit(f.input, () => ({})).replyOptions).toEqual({})
    expect(f.sandbox).not.toHaveBeenCalled()
    f.cfg.agents.defaults.sandbox.mode = 'off'
    expect(() => runtime.admit(f.input, () => ({}))).not.toThrow()
    runtime.services.stop()
  })
  it('uses the public runtime resolver for primary, aliased fallback, ACP, and latest session overrides', () => {
    const f = fixture()
    f.cfg.agents.defaults.model = { primary: 'probe/main' }
    f.cfg.models = { providers: { probe: { api: 'openai-completions', baseUrl: 'http://localhost/v1',
      agentRuntime: { id: 'openclaw' }, models: [{ id: 'main' }, { id: 'backup', agentRuntime: { id: 'unsafe-harness' } }] } } }
    const check = (entry?: any) => assertBuiltinScopeRuntime(f.cfg, 'main', 'agent:main:test', entry)
    expect(check()).toEqual([{ provider: 'probe', model: 'main' }])
    f.cfg.agents.defaults.models = { 'probe/backup': { alias: 'Backup' } }
    f.cfg.agents.defaults.model.fallbacks = ['Backup']
    expect(() => check({ modelSelectionLocked: true })).toThrow(/resolved unsafe-harness/)
    f.cfg.agents.entries = { main: { model: { primary: 'probe/main', fallbacks: [] } } }
    expect(check()).toEqual([{ provider: 'probe', model: 'main' }])
    expect(() => check({ providerOverride: 'probe', modelOverride: 'backup' })).toThrow(/resolved unsafe-harness/)
    expect(() => check({ agentHarnessId: 'unsafe-harness', modelSelectionLocked: true })).toThrow(/resolved unsafe-harness/)
    f.cfg.agents.entries.main.runtime = { type: 'acp' }
    expect(() => check()).toThrow(/ACP/)
  })
  it('does not gate ordinary tool calls but refuses native unscoped memory/workshop', () => {
    const f = fixture(); registerMemoryScope(f.api)
    const ctx = { agentId: 'main', sessionKey: 'agent:main:dingtalk-connector:direct:test', requester: { channel: 'dingtalk-connector' } }
    const hook = f.hooks.get('before_tool_call')!
    for (const toolName of ['exec', 'read', 'custom_plugin', 'browser']) expect(hook({ toolName }, ctx)).toBeUndefined()
    for (const toolName of ['memory_search', 'memory_recall', 'skill_workshop']) expect(hook({ toolName }, ctx)).toMatchObject({ block: true })
    expect(hook({ toolName: 'skill_workshop' }, { agentId: 'other', requester: { channel: 'other' } })).toBeUndefined()
    f.hooks.get('gateway_stop')!()
  })
  it('requires host hook capabilities before registering tools or writing files', () => {
    const f = fixture(); f.cfg.plugins.entries['dingtalk-connector'].hooks.allowConversationAccess = false
    expect(() => registerMemoryScope(f.api)).toThrow(/hook permission/)
    expect(f.api.registerTool).not.toHaveBeenCalled()
    expect(fs.readdirSync(f.root)).toEqual([])
  })
  it('does not register legacy workspace injection when hard scope is disabled', () => {
    const f = fixture(); f.cfg.channels['dingtalk-connector'].memoryScope.enabled = false
    registerMemoryScope(f.api)
    expect(f.api.registerTool).not.toHaveBeenCalled()
    expect(f.api.registerHook).not.toHaveBeenCalled()
    expect(fs.readdirSync(f.root)).toEqual([])
  })
  it('registers only requester tools without scoped memory or Gateway-wide memory changes', () => {
    const f = fixture()
    f.api.runtime.agent.session.getSessionEntry = () => ({ sessionId: 'current', lifecycleRevision: 'generation' })
    f.cfg.channels['dingtalk-connector'].memoryScope.enabled = false
    f.cfg.channels['dingtalk-connector'].groupSessionScope = 'group_sender'
    f.cfg.plugins.entries['dingtalk-connector'].config = { runtimeTools: { enabled: true } }
    f.cfg.plugins.slots.memory = 'memory-core'
    f.cfg.agents.defaults.compaction.memoryFlush.enabled = true
    f.cfg.hooks.internal.entries['session-memory'].enabled = true
    registerMemoryScope(f.api)
    expect(f.api.registerTool).toHaveBeenCalledOnce()
    expect(f.api.registerTool.mock.calls[0][1].names).toEqual(['dingtalk_dws', 'dingtalk_send_file'])
    expect(f.api.registerHook).not.toHaveBeenCalled()
    const routed = 'agent:main:dingtalk-connector:Bot:group:cid:Alice'
    const admitted = getHardScopeRuntime().admit({ ...f.input, chatType: 'group', conversationId: 'cid' },
      () => f.cfg.channels['dingtalk-connector'], routed)
    expect(admitted.sessionKey).toBe(routed)
    const context = { agentId: 'main', sessionId: 'current',
      sessionKey: routed, messageChannel: 'dingtalk-connector', agentAccountId: 'Bot', requesterSenderId: 'Alice',
      nativeChannelId: 'cid', toolBindings: admitted.context.GatewayRunToolBindings, assertInvocationCurrent() {} }
    const requester = getHardScopeRuntime().services.admissions.requester(context)
    expect(requester).toMatchObject({ tenantId: 'Corp', senderId: 'Alice' })
    expect(() => getHardScopeRuntime().services.admissions.toolGrant(context)).toThrow('Scoped storage is not admitted')
    expect(() => getHardScopeRuntime().services.admissions.sourceGrant({ agentId: 'main', sessionId: 'current',
      sessionKey: routed, channel: 'dingtalk-connector', accountId: 'Bot', senderId: 'Alice', chatId: 'cid',
      channelContext: admitted.context.ChannelContext }, ['workshop.read'], () => {})).toThrow('Scoped storage is not admitted')
    const prompt = { agentId: 'main', sessionId: 'current', sessionKey: routed, channel: 'dingtalk-connector',
      accountId: 'Bot', senderId: 'Alice', channelContext: admitted.context.ChannelContext,
      toolAuthority: { allows: (name: string) => name === 'dingtalk_dws' } }
    expect(f.hooks.get('before_prompt_build')!({}, prompt).prependSystemContext).toContain('dingtalk_dws')
    expect(f.hooks.get('before_prompt_build')!({}, { ...prompt, senderId: 'Bob' })).toBeUndefined()
    expect(() => getHardScopeRuntime().services.admissions.requester({ agentId: 'main', sessionId: 'current',
      sessionKey: routed, messageChannel: 'dingtalk-connector', agentAccountId: 'Bot', requesterSenderId: 'Bob',
      nativeChannelId: 'cid', toolBindings: admitted.context.GatewayRunToolBindings, assertInvocationCurrent() {} })).toThrow('requesterSenderId')
    f.hooks.get('gateway_stop')!()
  })
  it.each([
    ['native reset capture', (cfg: any) => { cfg.hooks.internal.entries['session-memory'].enabled = true }],
    ['native memory hooks', (cfg: any) => { cfg.plugins.slots.memory = 'memory-core' }],
    ['native flush', (cfg: any) => { cfg.agents.defaults.compaction.memoryFlush.enabled = true }],
    ['native learning', (cfg: any) => { cfg.tools.deny = [] }],
  ])('rejects %s before admission', (_name, mutate) => {
    const f = fixture(); mutate(f.cfg)
    const runtime = createHardScopeRuntime(f.api)
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/Scoped memory setup incomplete/)
    expect(fs.readdirSync(f.root)).toEqual([])
    runtime.services.stop()
  })
  it('requires explicit handling of old globally discovered learned skills', () => {
    const f = fixture(); const runtime = createHardScopeRuntime(f.api)
    fs.mkdirSync(path.join(f.root, 'workshop-skills'))
    fs.writeFileSync(path.join(f.root, 'workshop-skills', 'private.md'), 'OTHER_USER_SENTINEL')
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/Existing Agent-wide learned skills/)
    runtime.services.stop()
  })
  it('revokes admission when host configuration changes', () => {
    const f = fixture(); const runtime = createHardScopeRuntime(f.api)
    const admitted = runtime.admit(f.input, () => ({}))
    expect(admitted.sessionKey).toMatch(/^agent:main:dingtalk-connector:direct:v1-/)
    f.cfg.agents.defaults.sandbox = { workspaceAccess: 'ro', docker: { binds: ['/public:/knowledge:ro'] } }
    expect(runtime.services.assertCurrent).not.toThrow()
    f.cfg.plugins.slots.memory = 'memory-core'
    expect(runtime.services.assertCurrent).toThrow(/configuration changed/)
    runtime.services.stop()
  })
  it('does not delete or prohibit operator-owned workspace files', () => {
    const f = fixture(); const runtime = createHardScopeRuntime(f.api)
    fs.writeFileSync(path.join(f.root, 'USER.md'), 'OTHER_USER_PROFILE_SENTINEL')
    expect(() => runtime.admit(f.input, () => ({}))).not.toThrow()
    expect(fs.readFileSync(path.join(f.root, 'USER.md'), 'utf8')).toBe('OTHER_USER_PROFILE_SENTINEL')
    runtime.services.stop()
  })
  it('removes unscoped memory from bootstrap without authorizing by session text', () => {
    const f = fixture(); registerMemoryScope(f.api)
    const files = [
      { name: 'MEMORY.md', path: 'C:\\work\\MEMORY.md' },
      { name: 'daily.md', path: '/work/memory/users/A/daily.md' },
      { name: 'AGENTS.md', path: '/work/AGENTS.md' },
    ]
    expect(stripUnscopedMemory(files)).toEqual([files[2]])
    const event = { type: 'agent', action: 'bootstrap', context: { sessionKey: 'agent:main:dingtalk-connector:forged', bootstrapFiles: files } }
    f.hooks.get('agent:bootstrap')!(event)
    expect(event.context.bootstrapFiles).toEqual([files[2]])
    const toolFactory = f.api.registerTool.mock.calls[0][0]
    expect(toolFactory.create({ sessionKey: event.context.sessionKey })).toBeNull()
    f.hooks.get('gateway_stop')!()
  })
  it('limits scoped admission to explicitly selected Agents', () => {
    const f = fixture(); f.cfg.channels['dingtalk-connector'].memoryScope.agents = ['main']
    const runtime = createHardScopeRuntime(f.api)
    expect(() => runtime.admit({ ...f.input, agentId: 'other' }, () => ({}))).toThrow(/not enabled/)
    runtime.services.stop()
  })
  it('uses the candidate config during reload construction and live config during execution', () => {
    const f = fixture()
    const retiring = structuredClone(f.cfg)
    retiring.channels['dingtalk-connector'].memoryScope.enabled = false
    retiring.plugins.entries['dingtalk-connector'].hooks.allowConversationAccess = false
    let current = retiring
    f.api.runtime.config.current = () => current
    const runtime = createHardScopeRuntime(f.api)
    expect(runtime.services.assertCurrent).toThrow(/configuration changed/)
    current = f.cfg
    expect(() => runtime.admit(f.input, () => ({}))).not.toThrow()
    current = retiring
    expect(runtime.services.assertCurrent).toThrow(/configuration changed/)
    runtime.services.stop()
  })
  it('does not strip bootstrap or intercept native tools for an unselected DingTalk Agent', () => {
    const f = fixture(); f.cfg.channels['dingtalk-connector'].memoryScope.agents = ['main']
    registerMemoryScope(f.api)
    const files = [{ name: 'MEMORY.md', path: '/other/MEMORY.md' }]
    const event = { type: 'agent', action: 'bootstrap', context: { sessionKey: 'agent:other:dingtalk-connector:direct:x', bootstrapFiles: files } }
    f.hooks.get('agent:bootstrap')!(event)
    expect(event.context.bootstrapFiles).toEqual(files)
    expect(f.hooks.get('before_tool_call')!({ toolName: 'skill_workshop' }, { agentId: 'other', sessionKey: event.context.sessionKey })).toBeUndefined()
    f.hooks.get('gateway_stop')!()
  })
  it('keeps new inbound authority through session_end then before_reset without refreshing an old grant', async () => {
    const f = fixture()
    f.api.runtime.agent.session.getSessionEntry = () => ({ sessionId: 'current', lifecycleRevision: 'new-generation' })
    registerMemoryScope(f.api)
    const admitted = getHardScopeRuntime().admit(f.input, () => ({}))
    await admitted.run(async () => {
      const oldContext = { sessionKey: admitted.sessionKey, sessionId: 'previous' }
      f.hooks.get('session_end')!({ reason: 'new' }, oldContext)
      f.hooks.get('before_reset')!({ reason: 'new' }, oldContext)
      const tool = f.api.registerTool.mock.calls[0][0].create({
        agentId: 'main', sessionKey: admitted.sessionKey, sessionId: 'current',
        messageChannel: 'dingtalk-connector', agentAccountId: 'Bot', requesterSenderId: 'Alice', nativeChannelId: 'DM',
        toolBindings: admitted.context.GatewayRunToolBindings, assertInvocationCurrent() {},
      })
      expect(tool).not.toBeNull()
      expect((await tool.execute('read', { action: 'get', key: 'fact' })).details).toBeNull()
      f.hooks.get('session_end')!({ reason: 'reset' }, { ...oldContext, sessionId: 'current' })
      await expect(tool.execute('read', { action: 'get', key: 'fact' })).rejects.toThrow()
    })
    f.hooks.get('gateway_stop')!()
  })
  it('revokes the old runtime on plugin disposal even without a config change or Gateway stop', async () => {
    const f = fixture()
    let dispose: (() => void) | undefined
    f.api.runtime.agent.session.getSessionEntry = () => ({ sessionId: 'current' })
    f.api.lifecycle = { onDispose: (callback: () => void) => { dispose = callback } }
    registerMemoryScope(f.api)
    const runtime = getHardScopeRuntime()
    const admitted = runtime.admit(f.input, () => ({}))
    const ctx = { agentId: 'main', sessionKey: admitted.sessionKey, sessionId: 'current',
      messageChannel: 'dingtalk-connector', agentAccountId: 'Bot', requesterSenderId: 'Alice', nativeChannelId: 'DM',
      toolBindings: admitted.context.GatewayRunToolBindings, assertInvocationCurrent() {} }
    const tool = f.api.registerTool.mock.calls[0][0].create(ctx)
    const source = runtime.services.admissions.toolGrant(ctx)
    const background = runtime.services.admissions.backgroundGrant(ctx, ['workshop.write'], () => {})
    expect(dispose).toBeTypeOf('function')
    dispose!()
    expect(runtime.services.assertCurrent).toThrow(/stopped/)
    await expect(tool.execute('read', { action: 'get', key: 'fact' })).rejects.toThrow(/stopped/)
    expect(() => assertScopeGrant(source, 'memory.read')).toThrow()
    expect(() => assertScopeGrant(background, 'workshop.write')).toThrow()
    await expect(admitted.run(async () => 'unreachable')).rejects.toThrow()
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/stopped/)
    // Repeated teardown remains safe.
    f.hooks.get('gateway_stop')!()
  })
})
