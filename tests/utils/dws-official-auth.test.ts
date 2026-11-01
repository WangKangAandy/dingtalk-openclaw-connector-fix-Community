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
    expect(hint).toContain("Do not use the machine default profile")
  })

  it("fails closed when trusted corpId is missing", () => {
    const hint = buildOfficialDwsContextHint({ senderStaffId: "staff_1" })
    expect(hint).toContain("No trusted corpId")
    expect(hint).toContain("Do not run business dws")
    expect(hint).toContain("Do not pick a profile from `dws profile list`")
    expect(hint).not.toContain("dws --profile")
  })

  it("requires the exact official profile corpId:userId", () => {
    const hint = buildOfficialDwsContextHint({ senderStaffId: "staff_1", corpId: "dingcorp_1" })
    expect(hint).toContain("profile=dingcorp_1:staff_1")
    expect(hint).toContain("dws profile list --format json")
    expect(hint).toContain("dws --profile dingcorp_1:staff_1")
    expect(hint).toContain("exact corpId:userId")
    expect(hint).toContain("STOP")
    expect(hint).toContain("Never use the default/deployer profile")
    expect(hint).toContain("never guess among same-userId profiles")
  })
})
