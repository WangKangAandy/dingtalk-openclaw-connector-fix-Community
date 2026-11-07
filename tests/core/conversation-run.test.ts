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
})
