import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHardScopeRuntime, getHardScopeRuntime } from '../../src/memory-scope/hard-runtime.ts'
import { registerMemoryScope, stripUnscopedMemory } from '../../src/memory-scope/register.ts'
import { assertScopeGrant } from '../../src/memory-scope/authority.ts'
import { assertBuiltinScopeRuntime } from '../../src/memory-scope/runtime-policy.ts'

vi.mock('../../src/memory-scope/scoped-workshop/register.ts', () => ({ registerScopedWorkshop: vi.fn() }))
vi.mock('openclaw/plugin-sdk/agent-scope-runtime', () => ({ resolveAgentDir: (cfg: any) => cfg.agentDir }))

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-runtime-')); roots.push(root)
  const cfg: any = {
    agentDir: root,
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
  it('refuses a host-resolved implicit CLI dispatch and a missing host check', () => {
    const f = fixture(); const runtime = createHardScopeRuntime(f.api)
    f.api.runtime.agent.resolveCliBackendDispatchEligibility.mockReturnValue({ provider: 'custom-cli' })
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/subscription CLI dispatch/)
    f.api.runtime.agent.resolveCliBackendDispatchEligibility = undefined
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/CLI dispatch eligibility support/)
    expect(f.sandbox).not.toHaveBeenCalled()
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
  it('reads session runtime overrides again before a native tool executes', () => {
    const f = fixture()
    f.cfg.agents.defaults.model = 'probe/main'
    f.cfg.models = { providers: { probe: { api: 'openai-completions', baseUrl: 'http://localhost/v1', agentRuntime: { id: 'openclaw' }, models: [{ id: 'main' }] } } }
    registerMemoryScope(f.api)
    const context = { agentId: 'main', sessionKey: 'agent:main:dingtalk-connector:direct:test', requester: { channel: 'dingtalk-connector' } }
    const hook = f.hooks.get('before_tool_call')!
    expect(hook({ toolName: 'exec' }, context)).toBeUndefined()
    const load = vi.fn(() => ({ agentHarnessId: 'unsafe-harness', modelSelectionLocked: true }))
    f.api.runtime.agent.session.getSessionEntry = load
    expect(hook({ toolName: 'exec' }, context)).toMatchObject({ block: true })
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ readConsistency: 'latest', sessionKey: context.sessionKey }))
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
  it.each([
    ['native memory hooks', (cfg: any) => { cfg.plugins.slots.memory = 'memory-core' }],
    ['native search', (cfg: any) => { cfg.memory.search.enabled = true }],
    ['per-agent native search', (cfg: any) => { cfg.agents.entries = { main: { memory: { search: { enabled: true } } } } }],
    ['shared profile generation', (cfg: any) => { cfg.agents.defaults.skipOptionalBootstrapFiles = [] }],
    ['native flush', (cfg: any) => { cfg.agents.defaults.compaction.memoryFlush.enabled = true }],
    ['global learning', (cfg: any) => { cfg.skills.workshop.autonomous.mode = 'idle' }],
    ['host bind', (cfg: any) => { cfg.agents.defaults.sandbox = { docker: { binds: ['/private:/private'] } } }],
  ])('rejects %s before admission', (_name, mutate) => {
    const f = fixture(); mutate(f.cfg)
    const runtime = createHardScopeRuntime(f.api)
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/Hard scope/)
    expect(f.sandbox).not.toHaveBeenCalled()
    expect(fs.readdirSync(f.root)).toEqual([])
    runtime.services.stop()
  })
  it('rejects an unsafe host sandbox and preexisting unscoped learned skills', () => {
    const f = fixture(); const runtime = createHardScopeRuntime(f.api)
    f.sandbox.mockReturnValueOnce({ sandboxed: true, workspaceAccess: 'rw' })
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/exclusive confined sandbox/)
    fs.mkdirSync(path.join(f.root, 'workshop-skills'))
    fs.writeFileSync(path.join(f.root, 'workshop-skills', 'private.md'), 'OTHER_USER_SENTINEL')
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/Unscoped learned skills/)
    runtime.services.stop()
  })
  it('revokes admission when host configuration changes', () => {
    const f = fixture(); const runtime = createHardScopeRuntime(f.api)
    const admitted = runtime.admit(f.input, () => ({}))
    expect(admitted.sessionKey).toMatch(/^agent:main:dingtalk-connector:direct:v1-/)
    expect(f.sandbox.mock.calls[0][0].requiredToolNames).toEqual(['scoped_memory'])
    f.cfg.plugins.slots.memory = 'memory-core'
    expect(runtime.services.assertCurrent).toThrow(/configuration changed/)
    runtime.services.stop()
  })
  it('rejects a shared root user profile before it can be copied into the sandbox', () => {
    const f = fixture(); const runtime = createHardScopeRuntime(f.api)
    fs.writeFileSync(path.join(f.root, 'USER.md'), 'OTHER_USER_PROFILE_SENTINEL')
    expect(() => runtime.admit(f.input, () => ({}))).toThrow(/Unscoped USER.md/)
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
  it('rechecks host confinement immediately before native tool calls', () => {
    const f = fixture(); registerMemoryScope(f.api)
    const hook = f.hooks.get('before_tool_call')!
    const context = { agentId: 'main', sessionKey: 'agent:main:dingtalk-connector:direct:test', requester: { channel: 'dingtalk-connector' } }
    expect(hook({ toolName: 'read' }, context)).toBeUndefined()
    // Represents the public host resolver observing a new session exec/model
    // override after the connector's initial admission check.
    f.sandbox.mockReturnValue({ sandboxed: true, workspaceAccess: 'none', confinementError: 'execution outside sandbox' })
    expect(hook({ toolName: 'exec' }, context)).toMatchObject({ block: true })
    expect(hook({ toolName: 'read' }, { requester: context.requester })).toMatchObject({ block: true })
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
