import { describe, expect, it } from "vitest"

import {
  buildOfficialDwsContextHint,
  resolveOfficialDwsCorpId,
} from "../../src/utils/dws-official-auth.ts"

describe("resolveOfficialDwsCorpId", () => {
  it("prefers inbound chatbotCorpId over account binding", () => {
    expect(resolveOfficialDwsCorpId(" dingcorp_in ", "dingcorp_acct")).toBe("dingcorp_in")
  })

  it("falls back to the account binding when inbound corpId is missing", () => {
    expect(resolveOfficialDwsCorpId("", " dingcorp_acct ")).toBe("dingcorp_acct")
  })

  it("returns undefined when neither source has a corpId", () => {
    expect(resolveOfficialDwsCorpId(undefined, "  ")).toBeUndefined()
  })
})

describe("buildOfficialDwsContextHint", () => {
  it("fails closed when senderStaffId is missing", () => {
    const hint = buildOfficialDwsContextHint({ senderStaffId: "", corpId: "dingcorp_1" })
    expect(hint).toContain("No senderStaffId")
    expect(hint).toContain("Do not run business dws")
    expect(hint).not.toContain("profiles.json")
  })

  it("fails closed when trusted corpId is missing", () => {
    const hint = buildOfficialDwsContextHint({ senderStaffId: "staff_1" })
    expect(hint).toContain("No trusted corpId")
    expect(hint).toContain("Do not run business dws")
    expect(hint).not.toContain("dws profile list")
    expect(hint).not.toContain("profiles.json")
  })

  it("only carries inbound sender ids", () => {
    const hint = buildOfficialDwsContextHint({ senderStaffId: "staff_1", corpId: "dingcorp_1" })
    expect(hint).toBe("[DingTalk DWS Context] senderStaffId=staff_1 corpId=dingcorp_1")
    expect(hint).not.toContain("--profile")
    expect(hint).not.toContain("auth login")
    expect(hint).not.toContain("profiles.json")
  })
})
