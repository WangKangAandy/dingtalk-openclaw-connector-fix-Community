export type EditValidationFailure = {
  ok: false
  kind: "missing" | "invalid"
  fieldPath?: string
  detail?: string
}

export type EditValidationResult = { ok: true } | EditValidationFailure

export type EditToolGuardDecision =
  | { action: "allow" }
  | { action: "block"; reason: string }

/**
 * Mirrors upstream OpenClaw edit param validation (fixed semantics).
 * Workaround for https://github.com/openclaw/openclaw — empty oldText must not
 * surface as "Missing required parameter: edits".
 */
export function validateEditArguments(
  record: Record<string, unknown> | null | undefined,
): EditValidationResult {
  const edits = record?.edits
  if (edits === undefined || edits === null) {
    return { ok: false, kind: "missing" }
  }
  if (!Array.isArray(edits)) {
    return { ok: false, kind: "invalid", fieldPath: "edits", detail: "must be an array" }
  }
  if (edits.length === 0) {
    return {
      ok: false,
      kind: "invalid",
      fieldPath: "edits",
      detail: "must contain at least one replacement",
    }
  }

  for (let i = 0; i < edits.length; i++) {
    const entry = edits[i]
    if (!entry || typeof entry !== "object") {
      return {
        ok: false,
        kind: "invalid",
        fieldPath: `edits[${i}]`,
        detail: "must be an object with oldText and newText",
      }
    }
    const replacement = entry as Record<string, unknown>
    if (typeof replacement.oldText !== "string") {
      return {
        ok: false,
        kind: "invalid",
        fieldPath: `edits[${i}].oldText`,
        detail: "must be a string",
      }
    }
    if (replacement.oldText.trim().length === 0) {
      return {
        ok: false,
        kind: "invalid",
        fieldPath: `edits[${i}].oldText`,
        detail: "must not be empty",
      }
    }
    if (typeof replacement.newText !== "string") {
      return {
        ok: false,
        kind: "invalid",
        fieldPath: `edits[${i}].newText`,
        detail: "must be a string",
      }
    }
  }

  return { ok: true }
}

export function formatEditValidationError(validation: EditValidationFailure): string {
  if (validation.kind === "missing") {
    return "Missing required parameter: edits"
  }
  return `Invalid edit parameter: ${validation.fieldPath} ${validation.detail}. Use write for new files or full-file initialization; edit only replaces existing text.`
}

export function evaluateEditToolCall(
  toolName: string,
  toolParams: Record<string, unknown>,
): EditToolGuardDecision {
  if (toolName !== "edit") {
    return { action: "allow" }
  }

  const validation = validateEditArguments(toolParams)
  if (validation.ok) {
    return { action: "allow" }
  }

  return {
    action: "block",
    reason: formatEditValidationError(validation),
  }
}
