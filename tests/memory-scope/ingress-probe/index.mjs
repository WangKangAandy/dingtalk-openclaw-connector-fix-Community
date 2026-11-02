// Test-only RPC drives the production admission adapter and the real host reply
// dispatcher. It does not impersonate a live DingTalk Stream delivery.
import { registerMemoryScope } from './src/memory-scope/register.ts'
import { getHardScopeRuntime } from './src/memory-scope/hard-runtime.ts'
import { resolveInboundScope } from './src/memory-scope/inbound.ts'
import fs from 'node:fs'
import path from 'node:path'

export default function register(api) {
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
  api.registerGatewayMethod('hardProbe.turn', async ({ params, respond }) => {
    try {
      const config = api.runtime.config.current()
      const policy = config.channels['dingtalk-connector']
      const event = { conversationType: params.group ? '2' : '1', conversationId: params.conversation,
        senderStaffId: params.sender, chatbotCorpId: 'FixtureCorp' }
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
      const result = await reply.dispatchReplyWithBufferedBlockDispatcher({ ctx, cfg: config,
        dispatchReplyFromConfig: reply.dispatchReplyFromConfig,
        dispatcherOptions: { deliver: async payload => { delivered.push(payload) },
          onError: error => { errors.push(String(error)) } },
        replyOptions: { sourceReplyDeliveryMode: 'automatic' },
      })
      respond(true, { sessionKey: admitted.sessionKey, delivered, errors, result })
    } catch (error) { respond(false, { error: String(error) }) }
  })
}
