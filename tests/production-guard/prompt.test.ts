import { describe, expect, it } from "vitest"

import { buildProductionWriteGuardPrompt, PRODUCTION_WRITE_BLOCK_MESSAGE } from "../../src/production-guard/prompt.ts"

describe("production write guard prompt", () => {
  it("explains the read-only boundary without exposing implementation details", () => {
    const prompt = buildProductionWriteGuardPrompt()
    expect(prompt).toContain("生产知识库仅允许读取")
    expect(prompt).toContain(PRODUCTION_WRITE_BLOCK_MESSAGE)
    expect(prompt).not.toContain("knowledge/departments")
    expect(prompt).not.toContain("production-write-guard")
    expect(prompt).not.toContain("sessionKey")
  })
})
