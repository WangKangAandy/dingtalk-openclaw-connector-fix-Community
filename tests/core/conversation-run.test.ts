import { describe, expect, it } from "vitest"
import { dingtalkHttp } from "../../src/utils/http-client.ts"
import { abortConversationRuns, bindConversationCallbacks, withCancelledCardClose, withConversationRun, withHostOutbound } from "../../src/core/conversation-run.ts"

describe("stopped conversation output", () => {
  it("rejects a late platform send at the transport while allowing only cancellation card close", async () => {
    let late!: () => unknown
    await withConversationRun({ accountId: "bot", sessionKey: "session" }, async () => {
      late = bindConversationCallbacks({ send: () => dingtalkHttp.post(
        "https://api.dingtalk.com/v1.0/robot/groupMessages/send", { msgKey: "sampleText" },
      ) }).send
      abortConversationRuns("bot", "session")
      expect(() => late()).toThrow(/abort/i)
      await withCancelledCardClose(async () => {
        expect(() => dingtalkHttp.put("https://api.dingtalk.com/v1.0/card/streaming", { isFinalize: true })).not.toThrow()
      })
    })
    expect(() => late()).toThrow(/closed/i)
  })
  it("lets a fresh Host outbound use its own signal instead of inheriting a stopped turn", async () => {
    await withConversationRun({ accountId: "bot", sessionKey: "session" }, async () => {
      abortConversationRuns("bot", "session")
      await withHostOutbound(new AbortController().signal, async () => {
        expect(() => dingtalkHttp.post("https://api.dingtalk.com/v1.0/robot/groupMessages/send", {})).not.toThrow()
      })
      const cancelled = new AbortController()
      cancelled.abort()
      expect(() => withHostOutbound(cancelled.signal, async () => {})).toThrow(/abort/i)
    })
  })
  it("does not let another sender stop a shared session run", async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let signal!: AbortSignal
    const running = withConversationRun({ accountId: "bot", sessionKey: "shared", senderId: "alice" }, async run => {
      signal = run.controller.signal
      await gate
    })
    abortConversationRuns("bot", "shared", "bob")
    expect(signal.aborted).toBe(false)
    abortConversationRuns("bot", "shared", "alice")
    expect(signal.aborted).toBe(true)
    release()
    await running
  })
  it("guards session-webhook text after stop", async () => {
    await withConversationRun({ accountId: "bot", sessionKey: "webhook", senderId: "alice" }, async () => {
      abortConversationRuns("bot", "webhook", "alice")
      expect(() => dingtalkHttp.post("https://oapi.dingtalk.com/robot/sendBySession?session=test", {})).toThrow(/abort/i)
    })
  })
})
