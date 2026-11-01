import { describe, expect, it } from "vitest"

import { buildOfficialDwsContextHint } from "../../src/utils/dws-official-auth.ts"

describe("buildOfficialDwsContextHint", () => {
  it("fails closed when senderStaffId is missing", () => {
    const hint = buildOfficialDwsContextHint("")
    expect(hint).toContain("No senderStaffId")
    expect(hint).toContain("Do not run business dws")
    expect(hint).toContain("Do not use the machine default profile")
  })

  it("requires an official profile whose userId matches the requester", () => {
    const hint = buildOfficialDwsContextHint("staff_1")
    expect(hint).toContain("userId=staff_1")
    expect(hint).toContain("dws profile list --format json")
    expect(hint).toContain("dws --profile <corpId:staff_1>")
    expect(hint).toContain("STOP")
    expect(hint).toContain("Never use the default/deployer profile")
  })
})
