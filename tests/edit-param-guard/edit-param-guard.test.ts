import { describe, expect, it } from "vitest"

import {
  evaluateEditToolCall,
  formatEditValidationError,
  validateEditArguments,
} from "../../src/edit-param-guard/testables.ts"

describe("edit-param-guard", () => {
  it("allows non-edit tools", () => {
    expect(evaluateEditToolCall("write", { path: "a.txt", content: "x" })).toEqual({
      action: "allow",
    })
  })

  it("allows valid edit payloads", () => {
    expect(
      validateEditArguments({
        path: "foo.txt",
        edits: [{ oldText: "a", newText: "b" }],
      }).ok,
    ).toBe(true)
    expect(
      evaluateEditToolCall("edit", {
        path: "foo.txt",
        edits: [{ oldText: "a", newText: "b" }],
      }),
    ).toEqual({ action: "allow" })
  })

  it("reports missing edits", () => {
    const validation = validateEditArguments({ path: "foo.txt" })
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(formatEditValidationError(validation)).toBe("Missing required parameter: edits")
  })

  it("blocks empty oldText with explicit field error (not missing edits)", () => {
    const validation = validateEditArguments({
      path: "memory/groups/test/MEMORY.md",
      edits: [{ oldText: "", newText: "# title" }],
    })
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.fieldPath).toBe("edits[0].oldText")
    expect(validation.detail).toBe("must not be empty")

    const decision = evaluateEditToolCall("edit", {
      path: "memory/groups/test/MEMORY.md",
      edits: [{ oldText: "", newText: "# title" }],
    })
    expect(decision).toEqual({
      action: "block",
      reason:
        "Invalid edit parameter: edits[0].oldText must not be empty. Use write for new files or full-file initialization; edit only replaces existing text.",
    })
  })

  it("blocks empty edits array", () => {
    const validation = validateEditArguments({ path: "foo.txt", edits: [] })
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.fieldPath).toBe("edits")
    expect(validation.detail).toBe("must contain at least one replacement")
  })
})
