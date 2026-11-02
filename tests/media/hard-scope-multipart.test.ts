import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const captured = vi.hoisted(() => ({ uploaded: '', finished: [] as string[] }))
vi.mock('openclaw/plugin-sdk/channel-outbound', () => ({
  createReplyPrefixOptions: () => ({ onModelSelected() {} }),
  createTypingCallbacks: () => ({ onActive() {}, onIdle() {}, onCleanup() {} }), logTypingFailure() {},
}))
vi.mock('openclaw/plugin-sdk/agent-scope-runtime', () => ({ resolveAgentConfig: () => undefined }))
vi.mock('../../src/channel.ts', () => ({ CHANNEL_ID: 'dingtalk-connector' }))
vi.mock('../../src/config/accounts.ts', () => ({ resolveDingtalkAccount: () => ({ accountId: 'fixture', config: { streaming: true } }) }))
vi.mock('../../src/runtime.ts', () => ({ getDingtalkRuntime: () => ({ channel: {
  text: { resolveTextChunkLimit: () => 4000, resolveChunkMode: () => 'markdown', chunkTextWithMode: (s: string) => [s] },
  reply: { resolveHumanDelayConfig: () => ({}) },
} }) }))
vi.mock('../../src/services/messaging/card.ts', () => ({
  createAICardForTarget: async () => ({ cardInstanceId: 'fixture-card', accessToken: 'fixture-token' }),
  streamAICard: async () => {}, finishAICard: async (_card: unknown, text: string) => { captured.finished.push(text) },
  isAmbiguousCardError: () => false, registerActiveCard() {}, unregisterActiveCard() {},
}))
vi.mock('../../src/services/messaging.ts', () => ({
  sendMessage: vi.fn(), sendTextMessage: vi.fn(), sendMarkdownMessage: vi.fn(), sendMediaToDingTalk: vi.fn(),
}))
vi.mock('../../src/utils/token.ts', () => ({ getOapiAccessToken: async () => 'fixture-token' }))
vi.mock('../../src/card-feedback/index.ts', () => ({ recordCardAnswer() {}, registerCardSession() {} }))
vi.mock('../../src/card-exec-preview/index.ts', () => ({
  resolveCardExecPreviewConfig: () => ({ enabled: false }), buildCardExecPreviewHooks: () => ({}),
  createCardExecPreviewController: () => ({}),
}))
vi.mock('../../src/utils/index.ts', () => ({ DINGTALK_OAPI: 'https://example.invalid', getOapiAccessToken: vi.fn() }))
vi.mock('../../src/utils/http-client.ts', () => ({
  dingtalkHttp: {},
  dingtalkOapiHttp: { post: async (_url: string, form: any) => {
    // Consume the real file stream without making any network request.
    captured.uploaded = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      form.on('data', (part: string | Buffer) => chunks.push(Buffer.from(part)))
      form.on('error', reject)
      form.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      form.resume()
    })
    return { data: { media_id: '@test-only' } }
  } },
}))
import { processLocalImages } from '../../src/services/media/image.ts'
import { configureOutboundMediaPolicy, withOutboundMediaPolicy, BLOCKED_MEDIA_NOTICE } from '../../src/services/media/outbound-policy.ts'
import { createDingtalkReplyDispatcher } from '../../src/reply-dispatcher.ts'

afterEach(() => { configureOutboundMediaPolicy(false); captured.uploaded = ''; captured.finished = []; vi.restoreAllMocks() })

it('positive control: the real multipart harness consumes a local file in unrestricted mode', async () => {
  configureOutboundMediaPolicy(false)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-media-boundary-'))
  try {
    const privateFile = path.join(root, 'other-user-private.png')
    fs.writeFileSync(privateFile, 'OTHER_SCOPE_PRIVATE_SENTINEL')
    const output = await processLocalImages(`![report](${privateFile.replaceAll('\\', '/')})`, 'test-token')
    expect(output).toBe('![report](@test-only)')
    expect(captured.uploaded).toContain('OTHER_SCOPE_PRIVATE_SENTINEL')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

it('keeps deferred dispatcher callbacks from reading a private host file after policy reload', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-media-boundary-'))
  try {
    const privateFile = path.join(root, 'other-user-private.png')
    fs.writeFileSync(privateFile, 'OTHER_SCOPE_PRIVATE_SENTINEL')
    const result = withOutboundMediaPolicy(true, () => createDingtalkReplyDispatcher({
      cfg: {}, agentId: 'main', accountId: 'fixture', senderId: 'Alice', conversationId: 'dm',
      isDirect: true, sessionWebhook: 'https://example.invalid', runtime: {},
    }))
    // Invoke from a different async chain after leaving the restricted construction context.
    configureOutboundMediaPolicy(false)
    const read = vi.spyOn(fs, 'createReadStream')
    const content = `![report](${privateFile.replaceAll('\\', '/')})`
    await result.dispatcherOptions.onReplyStart?.()
    await result.replyOptions.onPartialReply?.({ text: content })
    await result.dispatcherOptions.deliver({ text: content, mediaUrl: privateFile }, { kind: 'final' })
    await result.dispatcherOptions.onIdle?.()
    await result.flushOutboundMedia(content)
    expect(captured.finished.join('\n')).toContain(BLOCKED_MEDIA_NOTICE)
    expect(read).not.toHaveBeenCalled()
    expect(captured.uploaded).toBe('')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
