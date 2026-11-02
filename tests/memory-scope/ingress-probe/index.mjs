// Test-only RPC drives the production admission adapter and the real host reply
// dispatcher. It does not impersonate a live DingTalk Stream delivery.
import { registerMemoryScope } from './src/memory-scope/register.ts'
import { getHardScopeRuntime } from './src/memory-scope/hard-runtime.ts'
import { resolveInboundScope } from './src/memory-scope/inbound.ts'
import fs from 'node:fs'
import path from 'node:path'
import { resolveEffectiveAgentRuntime } from 'openclaw/plugin-sdk/command-auth-native'

export default function register(api) {
  // Opt-in acceptance probe: the executable can only read/write files created
  // by this fixture. It proves actual host placement, not a guessed CLI name.
  if (process.env.HARD_SCOPE_CLI_ROUTING_PROBE === '1') {
    const root = path.dirname(api.config.agents.defaults.workspace)
    const program = `const fs=require('node:fs'); const result={cwd:process.cwd(),sentinel:fs.readFileSync(${JSON.stringify(path.join(root, 'host-private.txt'))},'utf8')};fs.writeFileSync(${JSON.stringify(path.join(root, 'cli-host-marker.json'))},JSON.stringify(result));console.log('fixture CLI completed')`
    api.registerCliBackend({ id: 'fixture-shell', config: { command: process.execPath, args: ['-e', program],
      output: 'text', input: 'stdin', sessionMode: 'none', systemPromptWhen: 'never' } })
    api.registerGatewayMethod('hardProbe.cliRoute', ({ respond }) => {
      const config = api.runtime.config.current(), agentId = 'main'
      const sessionKey = 'agent:main:dingtalk-connector:direct:fixture'
      const runtime = resolveEffectiveAgentRuntime({ cfg: config, provider: 'fixture-shell', modelId: 'probe', agentId, sessionKey, mode: 'execution' })
      const eligible = api.runtime.agent.resolveCliBackendDispatchEligibility({ config, provider: 'fixture-shell', model: 'probe', agentId })
      const sandbox = api.runtime.sandbox.resolveWorkspaceAuthority({ config, agentId, sessionKey,
        confinedToolNames: ['scoped_memory', 'scoped_skill_workshop'], requiredToolNames: ['scoped_memory'] })
      let admitted = false, error
      try { getHardScopeRuntime().assertExecution({ agentId, sessionKey }); admitted = true } catch (e) { error = String(e) }
      respond(true, { runtime, subscriptionEligibility: eligible ?? null, sandbox, admitted, error })
    })
  }
  api.registerGatewayMethod('hardProbe.ready', ({ respond }) => respond(true, { ready: true }))
  // Register the transport identity with the real host. No Stream connection or
  // external send is made; the dispatcher below captures delivery locally.
  api.registerChannel({ plugin: {
    id: 'dingtalk-connector',
    meta: { id: 'dingtalk-connector', label: 'Fixture DingTalk', selectionLabel: 'Fixture DingTalk', docsPath: '/fixture', blurb: 'Local ingress fixture' },
    capabilities: { chatTypes: ['direct','group'] },
    config: {
      listAccountIds: () => ['fixture'],
      resolveAccount: cfg => ({ accountId: 'fixture', enabled: true, configured: true, config: cfg.channels['dingtalk-connector'] }),
      isEnabled: () => true, isConfigured: () => true,
    },
  } })
  registerMemoryScope({ ...api, registerTool(factory, options) {
    if (factory.contextVersion !== 2) return api.registerTool(factory, options)
    return api.registerTool({ ...factory, create(ctx) {
      const result = factory.create(ctx)
      fs.appendFileSync(path.join(api.config.agents.defaults.workspace,'factory-contexts.jsonl'), JSON.stringify({
        tool: options?.name, created: Boolean(result), agentId: ctx.agentId, sessionKey: ctx.sessionKey,
        sessionId: ctx.sessionId, messageChannel: ctx.messageChannel, agentAccountId: ctx.agentAccountId,
        requesterSenderId: ctx.requesterSenderId, nativeChannelId: ctx.nativeChannelId,
        bindingKeys: Object.keys(ctx.toolBindings ?? {}), hasInvocationGuard: typeof ctx.assertInvocationCurrent === 'function',
      })+'\n')
      return result
    } }, options)
  } })
  api.on('session_end', (event, ctx) => {
    fs.appendFileSync(path.join(api.config.agents.defaults.workspace, 'lifecycle-events.jsonl'), JSON.stringify({
      reason: event.reason, sessionKey: ctx.sessionKey, sessionId: event.sessionId, nextSessionId: event.nextSessionId,
    })+'\n')
  })
  api.on('after_compaction', (event, ctx) => {
    fs.appendFileSync(path.join(api.config.agents.defaults.workspace, 'compaction-events.jsonl'), JSON.stringify({
      sessionKey: ctx.sessionKey, sessionId: ctx.sessionId, previousSessionId: event.previousSessionId,
      messageCount: event.messageCount, compactedCount: event.compactedCount,
    })+'\n')
  })
  api.registerGatewayMethod('hardProbe.turn', async ({ params, respond }) => {
    try {
      const config = api.runtime.config.current()
      const policy = config.channels['dingtalk-connector']
      const event = { conversationType: params.group ? '2' : '1', conversationId: params.conversation,
        senderStaffId: params.sender, chatbotCorpId: params.tenant === undefined ? 'FixtureCorp' : params.tenant }
      if (params.handler) {
        const { setDingtalkRuntime } = await import('./src/runtime.ts')
        const { dingtalkHttp, dingtalkOapiHttp, dingtalkUploadHttp } = await import('./src/utils/http-client.ts')
        const { handleDingTalkMessageInternal } = await import('./src/core/message-handler.ts')
        setDingtalkRuntime(api.runtime)
        const deliveries = []
        // Substitute only the platform transport. Parsing, routing, admissions,
        // host dispatch, tools, and card/text formatting remain production code.
        const adapter = async request => {
          deliveries.push({ url: request.url, data: request.data })
          return { config: request, status: 200, statusText: 'OK', headers: {},
            data: { accessToken: 'fixture-only', access_token: 'fixture-only', expireIn: 7200, expires_in: 7200,
              errcode: 0, success: true, processQueryKey: 'fixture-only' } }
        }
        dingtalkHttp.defaults.adapter = adapter
        dingtalkOapiHttp.defaults.adapter = adapter
        dingtalkUploadHttp.defaults.adapter = adapter
        try { await handleDingTalkMessageInternal({ accountId: 'fixture', config: policy, cfg: config,
          data: { ...event, msgtype: 'text', text: { content: params.message }, senderNick: params.sender,
            senderCorpId: 'FixtureCorp', msgId: params.eventId, isInAtList: true,
            sessionWebhook: 'https://fixture.invalid/webhook' },
          sessionWebhook: 'https://fixture.invalid/webhook', runtime: { log() {}, error: console.error } }) }
        finally { fs.appendFileSync(path.join(config.agents.defaults.workspace,'platform-deliveries.jsonl'), JSON.stringify({ eventId: params.eventId, deliveries })+'\n') }
        respond(true, { platformCalls: deliveries.length })
        return
      }
      const input = resolveInboundScope(event, 'fixture', 'main', policy)
      const admitted = getHardScopeRuntime().admit(input, () => api.runtime.config.current().channels['dingtalk-connector'])
      const reply = api.runtime.channel.reply
      const ctx = reply.finalizeInboundContext({ ...admitted.context,
        Body: params.message, BodyForAgent: params.message, RawBody: params.message, CommandBody: params.message,
        From: params.sender, To: params.group ? params.conversation : params.sender,
        AccountId: 'fixture', ChatType: params.group ? 'group' : 'direct',
        SenderId: params.sender, SenderName: params.sender, Provider: 'dingtalk-connector', Surface: 'dingtalk-connector',
        OriginatingChannel: 'dingtalk-connector', OriginatingTo: params.group ? params.conversation : params.sender,
        MessageSid: params.eventId, Timestamp: Date.now(), CommandAuthorized: true,
      })
      const delivered = [], errors = []
      const result = await admitted.run(() => reply.dispatchReplyWithBufferedBlockDispatcher({ ctx, cfg: config,
        dispatchReplyFromConfig: reply.dispatchReplyFromConfig,
        dispatcherOptions: { deliver: async payload => { delivered.push(payload) },
          onError: error => { errors.push(String(error)) } },
        replyOptions: { sourceReplyDeliveryMode: 'automatic' },
      }))
      respond(true, { sessionKey: admitted.sessionKey, delivered, errors, result })
    } catch (error) { respond(false, undefined, { code: 'INVALID_REQUEST', message: String(error) }) }
  })
}
