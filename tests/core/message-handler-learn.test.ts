import { beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { QuoteBodyStore, setQuoteBodyStoreForTest } from "../../src/utils/quote-body-store.ts"

const mocks = vi.hoisted(() => ({
  send: vi.fn(), finish: vi.fn(), recall: vi.fn(),
  dispatch: vi.fn(async (params: any) => { await params.replyOptions?.turnAdoptionLifecycle?.onAdopted(); return { queuedFinal: false, counts: { final: 0 } } }),
  reply: vi.fn((_params: any) => ({ dispatcherOptions: {}, replyOptions: {}, getAsyncModeResponse: () => "", flushOutboundMedia: vi.fn() })),
  routing: vi.fn((params: any) => `agent:${params.agentId}:dingtalk-connector:${params.accountId}:${params.peer.kind}:${params.peer.id}`),
  http: vi.fn(), httpPut: vi.fn(), currentConfig: vi.fn(),
}))
vi.mock("../../src/utils/utils-legacy.ts", async () => ({
  buildSessionContext: (await import("../../src/utils/session.ts")).buildSessionContext,
  getAccessToken: vi.fn(async () => "token"), getOapiAccessToken: vi.fn(async () => null),
  DINGTALK_API: "https://api.dingtalk.com", DINGTALK_OAPI: "https://oapi.dingtalk.com",
  addEmotionReply: vi.fn(async () => undefined), recallEmotionReply: mocks.recall,
}))
vi.mock("../../src/utils/agent.ts", () => ({ resolveAgentWorkspaceDir: () => "unused-test-workspace" }))
vi.mock("../../src/utils/http-client.ts", () => ({ dingtalkHttp: { post: mocks.http, put: mocks.httpPut } }))
vi.mock('../../src/utils/token.ts',()=>({DINGTALK_API:'https://api.dingtalk.com',getAccessToken:vi.fn(async()=>'fixture-token')}))
vi.mock("../../src/utils/index.ts", () => ({ createLoggerFromConfig: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }))
vi.mock("../../src/game-xiyou/index.ts", () => ({ isGamificationCommand: () => false }))
vi.mock("../../src/services/media/index.ts", () => ({
  processLocalImages: vi.fn(), processVideoMarkers: vi.fn(), processAudioMarkers: vi.fn(), uploadAndReplaceFileMarkers: vi.fn(),
}))
vi.mock("../../src/services/messaging/index.ts", () => ({ sendProactive: mocks.send }))
vi.mock("../../src/services/messaging/card.ts", () => ({ finishAICard: mocks.finish, createAICardForTarget: vi.fn(), streamAICard: vi.fn() }))
vi.mock("../../src/reply-dispatcher.ts", () => ({ createDingtalkReplyDispatcher: mocks.reply }))
vi.mock("../../src/runtime.ts", () => ({ getDingtalkRuntime: () => ({ config:{current:mocks.currentConfig}, agent: { resolveAgentWorkspaceDir: () => 'test-host-workspace' }, channel: {
  reply: {
    resolveEnvelopeFormatOptions: () => ({}), formatAgentEnvelope: ({ body }: any) => body,
    finalizeInboundContext: (ctx: any) => ctx, dispatchReplyWithBufferedBlockDispatcher: mocks.dispatch,
    dispatchReplyFromConfig: vi.fn(),
  }, routing: { buildAgentSessionKey: mocks.routing },
} }) }))
import { handleDingTalkMessage, handleDingTalkMessageInternal } from "../../src/core/message-handler.ts"
import { TurnStore } from "../../src/turn-state/store.ts"
import { runTrackedTurn, setTurnStoreFactoryForTest } from "../../src/turn-state/runtime.ts"
import { setHardScopeRuntime } from "../../src/memory-scope/hard-runtime.ts"
import { createScopeServices } from "../../src/memory-scope/services.ts"
import { admitInboundScope, assertInboundAccess } from "../../src/memory-scope/inbound.ts"
import { assertScopeGrant } from "../../src/memory-scope/authority.ts"
import { registerDingtalkQuestionTool, handleDingtalkQuestionCallback } from '../../src/questions/index.ts'

const enabled = {
  meta: { migrations: { skillWorkshopPlugin: true } },
  plugins: { entries: { "skill-workshop": { enabled: false }, "dingtalk-scoped-workshop": { enabled: true } } },
  tools: { deny: ["skill_workshop"] },
  skills: { workshop: { autonomous: { mode: "off" } } },
  // Command passthrough cases below exercise legacy routing; the first test
  // explicitly enables hard scope and supplies its trusted runtime fixture.
  channels: { "dingtalk-connector": { memoryScope: { enabled: false } } },
  bindings: [{ agentId: "work", match: { channel: "dingtalk-connector", accountId: "acc-1" } }],
}
async function receive(text: string, overrides: any = {}) {
  await handleDingTalkMessageInternal({
    accountId: "acc-1", config: {}, cfg: enabled,
    sessionWebhook: "https://unused.test", runtime: {},
    data: { msgtype: "text", text: { content: text }, conversationType: "1", senderStaffId: "alice", chatbotCorpId: "Corp", conversationId: "group-1", msgId: "msg-1" },
    ...overrides,
  })
}
beforeEach(() => vi.clearAllMocks())

describe("DingTalk /learn ingress with real extraction and routing context", () => {
  it.each(['normal','hard','route-changed','access-revoked'] as const)('resumes a native question with a new receipt and current admission: %s', async mode => {
    const denied=mode==='route-changed'||mode==='access-revoked'
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'question-ingress-'))
    const store=new TurnStore(path.join(dir,'turns.sqlite'))
    setTurnStoreFactoryForTest(()=>store)
    const config={clientId:'robot',clientSecret:'fixture'}
    let cfg:any={...enabled,channels:{'dingtalk-connector':{...config,accounts:{'acc-1':config},memoryScope:{enabled:mode==='hard'}}}}
    mocks.currentConfig.mockImplementation(()=>cfg)
    mocks.http.mockResolvedValue({status:200,data:{success:true,result:{deliverResults:[{success:true}]}}})
    mocks.httpPut.mockResolvedValue({status:200,data:{}})
    if(mode==='hard') {
      const services=createScopeServices({stateDir:dir,assertCurrent(){},captureSessionLease:()=>()=>{},
        runScopeWork:async(_facts,_signal,run)=>run(new AbortController().signal)})
      setHardScopeRuntime({services,assertAgent(){},admit(input,policy,options){
        return admitInboundScope(services,input,()=>assertInboundAccess(input,policy()),options)
      }})
    }
    let factory:any, question:any
    registerDingtalkQuestionTool({registerTool:(descriptor:any)=>{expect(descriptor.contextVersion).toBe(2);factory=descriptor.create}} as any)
    let invocationLive=true
    mocks.dispatch.mockImplementationOnce(async({ctx,replyOptions}:any)=>{
      await replyOptions.turnAdoptionLifecycle.onAdopted()
      const tool=factory({agentId:'work',sessionId:'host-session',sessionKey:ctx.SessionKey,messageChannel:ctx.Provider,
        agentAccountId:ctx.AccountId,requesterSenderId:ctx.SenderId,nativeChannelId:ctx.NativeChannelId,
        toolBindings:ctx.GatewayRunToolBindings,assertInvocationCurrent(){if(!invocationLive)throw Error('tool ended')}})
      const outcome=await tool.execute('call',{questions:[{question:'Which value?'}]})
      question=outcome.details
      invocationLive=false
      expect(question.status).toBe('pending')
      return {queuedFinal:false,counts:{final:0}}
    })
    const identity={accountId:'acc-1',botId:'robot',conversationId:'question-dm',senderId:'alice',messageId:'ask'}
    try {
      await runTrackedTurn(identity,()=>handleDingTalkMessage({accountId:'acc-1',cfg,config,runtime:{},sessionWebhook:'https://unused.test',
        data:{msgtype:'text',text:{content:'Ask me'},senderStaffId:'alice',conversationType:'1',conversationId:'question-dm',
          chatbotCorpId:'Corp',msgId:'ask'}}))
      expect(store.claim(identity).record).toMatchObject({closed:1,execution:'waiting_input'})
      const original=mocks.dispatch.mock.calls[0][0].ctx
      if(mode==='route-changed')cfg={...cfg,bindings:[{agentId:'different',match:{channel:'dingtalk-connector',accountId:'acc-1'}}]}
      if(mode==='access-revoked')cfg={...cfg,channels:{'dingtalk-connector':{...cfg.channels['dingtalk-connector'],
        accounts:{'acc-1':{...config,dmPolicy:'allowlist',allowFrom:['somebody-else']}}}}}
      const callback={accountId:'acc-1',config,data:{outTrackId:question.outTrackId,userId:'alice',content:{cardPrivateData:{
        actionIds:[question.questionId],params:{form:{answer_0:'/stop'},senderId:'mallory',sessionKey:'forged'}}}}}
      const response=await handleDingtalkQuestionCallback(callback)
      expect(response.status).toBe(denied?'resume_failed':'submitted')
      if(!denied) {
        const next=mocks.dispatch.mock.calls[1][0].ctx
        expect(next.SessionKey).toBe(original.SessionKey)
        expect(next.SenderId).toBe('alice')
        expect(JSON.parse(next.CommandBody)).toMatchObject({type:'dingtalk_question_answer',answers:{answer_0:'/stop'}})
        expect(store.claim({...identity,messageId:`question-answer:${question.questionId}`}).record).toMatchObject({closed:1,execution:'settled'})
        if(mode==='hard')expect(next.GatewayRunToolBindings['dingtalk.memoryScope.v1']).not.toBe(original.GatewayRunToolBindings['dingtalk.memoryScope.v1'])
      }
      await handleDingtalkQuestionCallback(callback)
      expect(mocks.dispatch).toHaveBeenCalledTimes(denied?1:2)
    } finally {setHardScopeRuntime(undefined);setTurnStoreFactoryForTest();fs.rmSync(dir,{recursive:true,force:true})}
  })
  it('does not revoke a hard-scope foreground grant merely because a second input queued at Host',async()=>{
    const services=createScopeServices({stateDir:process.cwd(),assertCurrent(){},captureSessionLease:()=>()=>{},
      runScopeWork:async(_facts,_signal,run)=>run(new AbortController().signal)})
    setHardScopeRuntime({services,assertAgent(){},admit(input,policy,options){
      return admitInboundScope(services,input,()=>assertInboundAccess(input,policy()),options)
    }})
    let release!:()=>void, firstReady!:()=>void, secondReady!:()=>void
    const gate=new Promise<void>(r=>{release=r}), ready=new Promise<void>(r=>{firstReady=r}), queued=new Promise<void>(r=>{secondReady=r})
    let grant:any, nextLifecycle:any
    mocks.dispatch.mockImplementationOnce(async({ctx,replyOptions}:any)=>{
      await replyOptions.turnAdoptionLifecycle.onAdopted()
      grant=services.admissions.toolGrant({agentId:'work',sessionId:'host-session',sessionKey:ctx.SessionKey,messageChannel:ctx.Provider,
        agentAccountId:ctx.AccountId,requesterSenderId:ctx.SenderId,nativeChannelId:ctx.NativeChannelId,
        toolBindings:ctx.GatewayRunToolBindings,assertInvocationCurrent(){}})
      firstReady(); await gate; return {queuedFinal:false,counts:{final:0}}
    })
    mocks.dispatch.mockImplementationOnce(async({replyOptions}:any)=>{
      nextLifecycle=replyOptions.turnAdoptionLifecycle; nextLifecycle.onDeferred(); secondReady()
      return {queuedFinal:false,counts:{final:0}}
    })
    const params={accountId:'acc-1',config:{},cfg:{...enabled,channels:{'dingtalk-connector':{memoryScope:{enabled:true}}}},
      runtime:{},sessionWebhook:'https://unused.test',data:{msgtype:'text',text:{content:'work'},conversationType:'2',
        senderStaffId:'alice',chatbotCorpId:'Corp',conversationId:'adoption-group',msgId:'first'}}
    const first=handleDingTalkMessage(params)
    let second:Promise<void>|undefined
    try {
      await Promise.race([ready,first])
      second=handleDingTalkMessage({...params,data:{...params.data,senderStaffId:'bob',msgId:'second'}})
      await Promise.race([queued,second])
      assertScopeGrant(grant,'memory.read')
      release(); await first
      assertScopeGrant(grant,'memory.read')
      await nextLifecycle.onAdopted()
      expect(()=>assertScopeGrant(grant,'memory.read')).toThrow()
      nextLifecycle.onSettled(); await second
    } finally {release();nextLifecycle?.onSettled();await first;await second;setHardScopeRuntime(undefined)}
  })
  it("keeps the receipt open through the public handler until Host dispatch settles", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queued-turn-'))
    const store = new TurnStore(path.join(dir, 'turns.sqlite'))
    setTurnStoreFactoryForTest(() => store)
    setQuoteBodyStoreForTest(new QuoteBodyStore(path.join(dir, 'quotes.json')))
    const identity = { accountId: 'acc-1', botId: 'robot', conversationId: 'queue-lifetime', messageId: 'queued-1', senderId: 'alice' }
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    mocks.dispatch.mockImplementationOnce(async () => { entered(); await gate; return { queuedFinal: false, counts: { final: 0 } } })
    let finished = false
    const handler = vi.fn(() => handleDingTalkMessage({
      accountId: identity.accountId, config: { clientId: identity.botId, groupReplyMode: 'text' }, cfg: enabled,
      sessionWebhook: 'https://unused.test', runtime: {},
      data: { msgtype: 'text', text: { content: 'hello' }, conversationType: '2',
        senderStaffId: identity.senderId, conversationId: identity.conversationId, msgId: identity.messageId },
    }))
    const running = runTrackedTurn(identity, handler).then(() => { finished = true })
    try {
      await Promise.race([started, running])
      await Promise.resolve()
      expect(finished).toBe(false)
      expect(store.claim(identity).record).toMatchObject({ closed: 0, execution: 'running' })
      expect(await runTrackedTurn(identity, handler)).toBe('duplicate')
      expect(handler).toHaveBeenCalledOnce()
      release()
      await running
      expect(store.claim(identity).record).toMatchObject({ closed: 1, execution: 'settled', disposition: 'handled' })
    } finally {
      release(); await running
      setTurnStoreFactoryForTest(); setQuoteBodyStoreForTest(null)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  it('lets an admitted stop reach the same Host session while ordinary dispatch is still active', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    let signal!: AbortSignal
    mocks.dispatch.mockImplementationOnce(async ({replyOptions}: any) => {
      signal = replyOptions.abortSignal; entered(); await gate
      return { queuedFinal: false, counts: { final: 0 } }
    })
    const config = { clientId: 'bot', dmPolicy: 'allowlist', allowFrom: ['alice'] }
    const params = { accountId: 'acc-1', config, cfg: enabled, runtime: {}, sessionWebhook: 'https://unused.test',
      data: { msgtype: 'text', text: {content: 'work'}, conversationType: '1', senderStaffId: 'alice', conversationId: 'control-dm', msgId: 'work' } }
    const work = handleDingTalkMessage(params)
    try {
      await Promise.race([ready,work])
      await handleDingTalkMessage({ ...params, data: {...params.data, senderStaffId: 'mallory', text: {content:'/stop'}} })
      expect(signal.aborted).toBe(false)
      expect(mocks.dispatch).toHaveBeenCalledTimes(1)
      await handleDingTalkMessage({...params, accountId:'other', data:{...params.data,text:{content:'/stop'}}})
      expect(signal.aborted).toBe(false)
      await handleDingTalkMessage({...params, data:{...params.data,msgId:'stop',text:{content:'/stop'}}})
      expect(signal.aborted).toBe(true)
      const stop = mocks.dispatch.mock.calls.at(-1)![0]
      expect(stop.ctx.CommandBody).toBe('/stop')
      expect(stop.ctx.CommandSource).toBe('text')
      expect(stop.ctx.SessionKey).toBe(mocks.dispatch.mock.calls[0][0].ctx.SessionKey)
      expect(stop.ctx.BodyForAgent).toBe('/stop')
      expect(stop.replyOptions.abortSignal).toBeUndefined()
    } finally { release(); await work }
  })
  it.each([false,true])('keeps a Host-deferred receipt and admission alive until its ownership settles (cancel=%s)', async cancel => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'host-deferred-'))
    const store=new TurnStore(path.join(dir,'turns.sqlite'))
    setTurnStoreFactoryForTest(()=>store)
    const identity={accountId:'acc-1',botId:'bot',conversationId:'deferred',messageId:'deferred-1',senderId:'alice'}
    let lifecycle: any
    let entered!:()=>void
    const ready=new Promise<void>(resolve=>{entered=resolve})
    mocks.dispatch.mockImplementationOnce(async ({replyOptions}:any)=>{
      lifecycle=replyOptions.turnAdoptionLifecycle
      expect(lifecycle.onDeferred()).toBe(true)
      entered()
      return {queuedFinal:false,counts:{final:0}}
    })
    let ended=false
    const pending=runTrackedTurn(identity,()=>receive('queued work',{data:{msgtype:'text',text:{content:'queued work'},
      senderStaffId:'alice',conversationType:'1',conversationId:'deferred',msgId:'deferred-1'}})).then(()=>{ended=true})
    try {
      await Promise.race([ready,pending])
      await new Promise(resolve=>setTimeout(resolve,0))
      expect(ended).toBe(false)
      expect(store.claim(identity).record.closed).toBe(0)
      expect(lifecycle.admission).toBe('exclusive')
      if(cancel) {
        await receive('/stop',{data:{msgtype:'text',text:{content:'/stop'},senderStaffId:'alice',
          conversationType:'1',conversationId:'deferred',msgId:'cancel'}})
        expect(lifecycle.abortSignal.aborted).toBe(true)
      }
      lifecycle.onSettled()
      await pending
      expect(store.claim(identity).record).toMatchObject({closed:1,execution:cancel?'cancelled':'settled'})
    } finally {
      lifecycle?.onSettled(); await pending
      setTurnStoreFactoryForTest(); fs.rmSync(dir,{recursive:true,force:true})
    }
  })
  it('hands consecutive ordinary messages to Host without maintaining a second FIFO', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    mocks.dispatch.mockImplementationOnce(async () => { entered(); await gate; return {queuedFinal:false, counts:{final:0}} })
    const params = {accountId:'acc-1',config:{},cfg:enabled,runtime:{},sessionWebhook:'https://unused.test',
      data:{msgtype:'text',text:{content:'work'},conversationType:'1',senderStaffId:'alice',conversationId:'host-queue',msgId:'first'}}
    const first=handleDingTalkMessage(params)
    try {
      await Promise.race([ready,first])
      await handleDingTalkMessage({...params,data:{...params.data,msgId:'second',text:{content:'follow up'}}})
      expect(mocks.dispatch).toHaveBeenCalledTimes(2)
      expect(mocks.dispatch.mock.calls[0][0].replyOptions.runId).not.toBe(mocks.dispatch.mock.calls[1][0].replyOptions.runId)
    } finally { release(); await first }
  })
  it("hydrates after trusted routing, keeps commands current, and never hydrates a denied sender", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-ingress-'))
    const store = new QuoteBodyStore(path.join(dir, 'quotes.json'))
    setQuoteBodyStoreForTest(store)
    const config = { clientId: 'robot', dmPolicy: 'allowlist', allowFrom: ['alice'] }
    const base = { msgtype: 'text', conversationType: '1', senderStaffId: 'alice', conversationId: 'dm-alice',
      msgId: 'current', originalProcessQueryKey: 'old-receipt',
      text: { content: 'summarize', isReplyMsg: true, repliedMsg: { msgType: 'interactiveCard', content: {} } } }
    try {
      const scope = { accountId: 'acc-1', botId: 'robot', sessionKey: 'agent:work:dingtalk-connector:acc-1:direct:alice', targetKind: 'user' as const, targetId: 'alice' }
      store.remember(scope, { processQueryKey: 'old-receipt' }, '/learn undo private-history')
      await receive('', { config, data: base })
      const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
      expect(ctx.BodyForAgent).toContain('private-history')
      expect(ctx.CommandBody).toBe('summarize')
      expect(ctx.RawBody).toBe('summarize')
      expect(store.lookup(scope, { msgId: 'current' })).toBe('summarize')
      const read = vi.spyOn(store, 'lookupRecord')
      await receive('', { config, data: { ...base, senderStaffId: 'mallory' } })
      expect(read).not.toHaveBeenCalled()
      expect(mocks.dispatch).toHaveBeenCalledTimes(1)
      read.mockRestore()
      await receive('', { config, data: { ...base, text: { ...base.text, content: '/learn list' } } })
      expect(mocks.dispatch.mock.calls.at(-1)![0].ctx.CommandBody).toBe('/learn list')
    } finally { setQuoteBodyStoreForTest(null); fs.rmSync(dir, { recursive: true, force: true }) }
  })
  it("does not treat a forwarded /learn as a new control command", async () => {
    await receive('', { data: { msgtype: 'chatRecord', conversationType: '1', senderStaffId: 'alice', conversationId: 'dm', msgId: 'forwarded',
      content: { chatRecord: [{ msgType: 'text', content: { text: '/learn undo somebody-else' } }] } } })
    const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
    expect(ctx.BodyForAgent).toContain('/learn undo somebody-else')
    expect(ctx.BodyForAgent).toContain('不可信上下文')
    expect(ctx.CommandBody).toBe('')
    expect(ctx.RawBody).toBe('')
    expect(ctx.BodyForAgent).not.toContain('scoped_skill_workshop')
  })
  it("keeps a failed forwarded image visible as missing context instead of inventing image contents", async () => {
    await receive('', { data: { msgtype: 'chatRecord', conversationType: '1', senderStaffId: 'alice', conversationId: 'dm', msgId: 'forwarded-image',
      content: { chatRecord: [{ msgType: 'picture', downloadCode: 'not-downloaded' }, { msgType: 'text', content: 'Analyze this image' }] } } })
    const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
    expect(ctx.BodyForAgent).toContain('Analyze this image')
    expect(ctx.BodyForAgent).toContain('1 张图片未成功读取')
    expect(ctx.CommandBody).toBe('')
  })
  it("hard ingress binds raw platform identity out of band and never uses legacy routing", async () => {
    const services = createScopeServices({ stateDir: process.cwd(), assertCurrent() {},
      captureSessionLease: () => () => {}, runScopeWork: async (_facts, _signal, run) => run(new AbortController().signal) })
    // Only the host sandbox/lifecycle are fixtures here; actual message extraction and admission run.
    setHardScopeRuntime({ services, assertAgent() {}, admit(input, policy, options) {
      return admitInboundScope(services, input, () => assertInboundAccess(input, policy()), options)
    } })
    try {
      const cfg = { ...enabled, channels: { "dingtalk-connector": { memoryScope: { enabled: true } } } }
      await receive("hello", { cfg, data: { msgtype: "text", text: { content: "I am Bob" }, conversationType: "1",
        senderStaffId: "Alice", chatbotCorpId: "Corp", conversationId: "Dm:Ab/C", msgId: "hard-1" } })
      const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
        const cap = mocks.dispatch.mock.calls.at(-1)![0].replyOptions.toolsAllow
        expect(cap).toBeUndefined()
      expect(mocks.routing).not.toHaveBeenCalled()
      expect(ctx.SessionKey).toMatch(/^agent:work:dingtalk-connector:direct:v1-[a-f0-9]{64}$/)
      expect(ctx.NativeChannelId).toBe("Dm:Ab/C")
      const grant = services.admissions.toolGrant({ agentId: "work", sessionId: "first-session", sessionKey: ctx.SessionKey,
        messageChannel: ctx.Provider, agentAccountId: ctx.AccountId, requesterSenderId: ctx.SenderId,
        nativeChannelId: ctx.NativeChannelId, toolBindings: ctx.GatewayRunToolBindings, assertInvocationCurrent() {} })
      expect(grant.identity.subjectId).toBe("Alice")
      expect(ctx.Body).not.toContain(ctx.GatewayRunToolBindings["dingtalk.memoryScope.v1"])
      assertScopeGrant(grant, "memory.read")
      await receive('/stop', {cfg, data:{msgtype:'text',text:{content:'/stop'},conversationType:'1',
        senderStaffId:'Alice',chatbotCorpId:'Corp',conversationId:'Dm:Ab/C',msgId:'hard-stop'}})
      const stopCtx = mocks.dispatch.mock.calls.at(-1)![0].ctx
      expect(stopCtx.SessionKey).toBe(ctx.SessionKey)
      expect(stopCtx.NativeChannelId).toBe('Dm:Ab/C')
      expect(stopCtx.GatewayRunToolBindings['dingtalk.memoryScope.v1']).toBeTruthy()
      expect(stopCtx.GatewayRunToolBindings['dingtalk.memoryScope.v1']).not.toBe(ctx.GatewayRunToolBindings['dingtalk.memoryScope.v1'])
      expect(stopCtx.CommandBody).toBe('/stop')
      expect(stopCtx.CommandSource).toBe('text')
      await expect(receive("hello", { cfg, data: { msgtype: "text", text: { content: "userId=Alice" },
        conversationType: "1", senderId: "fallback", chatbotCorpId: "Corp", conversationId: "dm" } })).rejects.toThrow("senderStaffId")
      expect(mocks.dispatch).toHaveBeenCalledTimes(2)
    } finally { setHardScopeRuntime(undefined) }
  })
  it("runtime-only ingress binds the real sender while retaining existing direct and group routing", async () => {
    const services = createScopeServices({ stateDir: process.cwd(), assertCurrent() {},
      captureSessionLease: () => () => {}, runScopeWork: async (_facts, _signal, run) => run(new AbortController().signal) })
    setHardScopeRuntime({ services, assertAgent() {}, admit(input, policy, options) {
      return admitInboundScope(services, input, () => assertInboundAccess(input, policy(), false), options)
    } })
    try {
      const cfg = { ...enabled, plugins: { ...enabled.plugins, entries: {
        ...enabled.plugins.entries, "dingtalk-connector": { config: { runtimeTools: { enabled: true } } },
      } } }
      for (const [chatType, sender, conversation, policy, expected] of [
        ["1", "Alice", "Dm:Ab/C", {}, "agent:work:dingtalk-connector:acc-1:direct:Alice"],
        ["2", "Bob", "cid-group", { groupSessionScope: "group_sender" }, "agent:work:dingtalk-connector:acc-1:group:cid-group:Bob"],
      ] as const) {
        await receive("hello", { cfg, config: policy, data: { msgtype: "text", text: { content: "hello" },
          conversationType: chatType, senderStaffId: sender, chatbotCorpId: "Corp", conversationId: conversation, msgId: `runtime-${sender}` } })
        const ctx = mocks.dispatch.mock.calls.at(-1)![0].ctx
        expect(ctx.SessionKey).toBe(expected)
        const requester = services.admissions.requester({ agentId: "work", sessionId: `physical-${sender}`,
          sessionKey: ctx.SessionKey, messageChannel: ctx.Provider, agentAccountId: ctx.AccountId,
          requesterSenderId: ctx.SenderId, nativeChannelId: ctx.NativeChannelId,
          toolBindings: ctx.GatewayRunToolBindings, assertInvocationCurrent() {} })
        expect(requester.senderId).toBe(sender)
        expect(ctx.Body).not.toContain(ctx.GatewayRunToolBindings["dingtalk.memoryScope.v1"])
      }
      expect(mocks.routing).toHaveBeenCalledTimes(2)
    } finally { setHardScopeRuntime(undefined) }
  })
  it.each(["/learn", "/learn list", "/learn view diagnose-request", "/learn undo diagnose-request"])("preserves native command input for %s while retaining identity and feedback", async text => {
    await receive(text)
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    const { ctx } = mocks.dispatch.mock.calls[0][0]
    for (const key of ["Body", "BodyForAgent", "RawBody", "CommandBody"]) {
      expect(ctx[key]).toContain(text)
    }
    expect(ctx).toMatchObject({ AccountId: "acc-1", SenderId: "alice", From: "alice", To: "alice", SessionKey: "agent:work:dingtalk-connector:acc-1:direct:alice", CommandAuthorized: true })
    expect(mocks.reply.mock.calls[0][0].userPrompt).toBe(text)
    expect(mocks.http).not.toHaveBeenCalled()
  })
  it("preserves group-sender isolation and binding", async () => {
    await receive("/learn", { config: { groupSessionScope: "group_sender" }, data: { msgtype: "text", text: { content: "/learn" }, conversationType: "2", senderStaffId: "alice", conversationId: "group-1" } })
    expect(mocks.dispatch.mock.calls[0][0].ctx).toMatchObject({ To: "group-1", ChatType: "group", SessionKey: "agent:work:dingtalk-connector:acc-1:group:group-1:alice" })
  })
  it("does not append shell DWS identity instructions to an ordinary user turn", async () => {
    await receive("查一下今天的日程", { config: { clientId: "ding-test" }, data: {
      msgtype: "text", text: { content: "查一下今天的日程" }, conversationType: "1",
      senderStaffId: "Alice", chatbotCorpId: "Corp", conversationId: "dm-Alice", msgId: "dws-no-shell" } })
    const ctx = mocks.dispatch.mock.calls[0][0].ctx
    expect(ctx.BodyForAgent).toBe("查一下今天的日程")
    expect(ctx.BodyForAgent).not.toContain("--profile")
    expect(ctx.BodyForAgent).not.toContain("profile list")
  })
  it("routes DingTalk document links to the bound business tool", async () => {
    await receive("请读 https://alidocs.dingtalk.com/i/nodes/test", { data: {
      msgtype: "text", text: { content: "请读 https://alidocs.dingtalk.com/i/nodes/test" },
      conversationType: "1", senderStaffId: "Alice", chatbotCorpId: "Corp", conversationId: "dm-Alice", msgId: "dws-link" } })
    const body = mocks.dispatch.mock.calls[0][0].ctx.BodyForAgent
    expect(body).toContain("dingtalk_dws")
    expect(body).not.toContain("search_skills")
    expect(body).not.toContain("dws --profile")
  })
  it.each([{}, { ...enabled, plugins: {} }])("replies without native dispatch for unavailable configuration", async cfg => {
    await receive("/learn", { cfg })
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.send.mock.calls[0][2]).toContain("未执行")
  })
  it("checks the channel allowlist before processing learning", async () => {
    await receive("/learn", { config: { dmPolicy: "allowlist", allowFrom: ["bob"] } })
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.send.mock.calls[0][2]).toContain("暂无权限")
  })
  it("finishes a queued card and clears its processing emotion for a usage reply", async () => {
    const card = { cardInstanceId: "queued" }
    await receive("/learn undo", { cfg: {}, preCreatedCard: card, emotionAlreadyAdded: true })
    expect(mocks.finish).toHaveBeenCalledWith(card, expect.stringContaining("未执行"), {}, expect.anything())
    expect(mocks.recall).toHaveBeenCalledOnce()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it.each([["/learner", "/learner"], ["hello", "hello"], ["/reset", "/new"]])("preserves existing command behavior: %s", async (text, expected) => {
    await receive(text)
    expect(mocks.dispatch.mock.calls[0][0].ctx.CommandBody).toBe(expected)
  })
})
