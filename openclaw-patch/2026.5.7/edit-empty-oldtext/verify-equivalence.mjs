#!/usr/bin/env node
/**
 * Verify edit-empty-oldtext dist patch matches former connector hook semantics.
 * Compares hook (validate.ts) vs live OpenClaw dist assertRequiredParams for edit.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OPENCLAW_ROOT =
  process.env.OPENCLAW_ROOT ?? path.join(process.env.HOME ?? "", ".nvm/versions/node/v24.14.1/lib/node_modules/openclaw")
const TOOLS_FILE = path.join(OPENCLAW_ROOT, "dist/openclaw-tools-0ftkmYS3.js")

const HINT =
  ". Use write for new files or full-file initialization; edit only replaces existing text."
const RETRY_SUFFIX = " Supply correct parameters before retrying."

// --- Former connector hook (src/edit-param-guard/validate.ts) ---
function validateEditArguments(record) {
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
    if (typeof entry.oldText !== "string") {
      return {
        ok: false,
        kind: "invalid",
        fieldPath: `edits[${i}].oldText`,
        detail: "must be a string",
      }
    }
    if (entry.oldText.trim().length === 0) {
      return {
        ok: false,
        kind: "invalid",
        fieldPath: `edits[${i}].oldText`,
        detail: "must not be empty",
      }
    }
    if (typeof entry.newText !== "string") {
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

function formatEditValidationError(validation) {
  if (validation.kind === "missing") {
    return "Missing required parameter: edits"
  }
  return `Invalid edit parameter: ${validation.fieldPath} ${validation.detail}${HINT}`
}

function hookEvaluateEdit(toolName, toolParams) {
  if (toolName !== "edit") return { action: "allow" }
  const validation = validateEditArguments(toolParams)
  if (validation.ok) return { action: "allow" }
  return { action: "block", reason: formatEditValidationError(validation) }
}

function normalizePatchMessage(message) {
  if (!message) return message
  let m = message
  if (m.endsWith(`.${RETRY_SUFFIX}`)) {
    m = m.slice(0, -(`.${RETRY_SUFFIX}`.length))
  } else if (m.endsWith(RETRY_SUFFIX)) {
    m = m.slice(0, -RETRY_SUFFIX.length)
  }
  return m
}

function loadPatchValidator() {
  if (!fs.existsSync(TOOLS_FILE)) {
    throw new Error(`OpenClaw tools file not found: ${TOOLS_FILE}`)
  }
  const src = fs.readFileSync(TOOLS_FILE, "utf8")
  if (!src.includes("function assertEditToolParams")) {
    throw new Error("assertEditToolParams not found — apply edit-empty-oldtext patch first")
  }

  const regionStart = src.indexOf("//#region src/agents/pi-tools.params.ts")
  const regionEnd = src.indexOf("//#endregion", regionStart)
  if (regionStart < 0 || regionEnd < 0) {
    throw new Error("Could not locate pi-tools.params.ts region in dist")
  }
  const region = src.slice(regionStart, regionEnd)

  const factory = new Function(
    `${region}
    return {
      validateEdit(record) {
        try {
          assertRequiredParams(record, REQUIRED_PARAM_GROUPS.edit, "edit");
          return { ok: true };
        } catch (err) {
          return { ok: false, message: err && err.message ? String(err.message) : String(err) };
        }
      },
      validateEditVanilla(record) {
        const missingLabels = [];
        for (const group of REQUIRED_PARAM_GROUPS.edit) {
          if (!(group.validator?.(record) ?? group.keys.some((key) => {
            if (!(key in record)) return false;
            const value = record[key];
            if (typeof value !== "string") return false;
            if (group.allowEmpty) return true;
            return value.trim().length > 0;
          }))) {
            missingLabels.push(group.label ?? group.keys.join(" or "));
          }
        }
        if (missingLabels.length > 0) {
          const joined = missingLabels.join(", ");
          return {
            ok: false,
            message: parameterValidationError(
              \`Missing required \${missingLabels.length === 1 ? "parameter" : "parameters"}: \${joined}\${formatReceivedParamHint(record, REQUIRED_PARAM_GROUPS.edit)}\`
            ).message,
          };
        }
        return { ok: true };
      },
    };`,
  )
  return factory()
}

const CASES = [
  {
    name: "valid edit",
    tool: "edit",
    params: { path: "foo.txt", edits: [{ oldText: "a", newText: "b" }] },
    expectAllow: true,
  },
  {
    name: "non-edit tool ignored by hook",
    tool: "write",
    params: { path: "a.txt", content: "x" },
    expectAllow: true,
    hookOnly: true,
  },
  {
    name: "missing edits",
    tool: "edit",
    params: { path: "foo.txt" },
    expectAllow: false,
    expectMessage: "Missing required parameter: edits",
  },
  {
    name: "empty oldText (primary bug)",
    tool: "edit",
    params: { path: "memory/groups/test/MEMORY.md", edits: [{ oldText: "", newText: "# title" }] },
    expectAllow: false,
    expectMessage:
      "Invalid edit parameter: edits[0].oldText must not be empty. Use write for new files or full-file initialization; edit only replaces existing text.",
    mustNotContain: "Missing required parameter: edits",
  },
  {
    name: "empty edits array",
    tool: "edit",
    params: { path: "foo.txt", edits: [] },
    expectAllow: false,
    expectMessage:
      "Invalid edit parameter: edits must contain at least one replacement. Use write for new files or full-file initialization; edit only replaces existing text.",
  },
  {
    name: "edits not array",
    tool: "edit",
    params: { path: "foo.txt", edits: "bad" },
    expectAllow: false,
    expectMessage:
      "Invalid edit parameter: edits must be an array. Use write for new files or full-file initialization; edit only replaces existing text.",
  },
  {
    name: "missing newText",
    tool: "edit",
    params: { path: "foo.txt", edits: [{ oldText: "a" }] },
    expectAllow: false,
    expectMessage:
      "Invalid edit parameter: edits[0].newText must be a string. Use write for new files or full-file initialization; edit only replaces existing text.",
  },
  {
    name: "missing path only",
    tool: "edit",
    params: { edits: [{ oldText: "a", newText: "b" }] },
    expectAllow: false,
    expectMessageIncludes: "Missing required parameter: path",
    // Hook only validated edits; upstream assertRequiredParams still catches missing path.
    hookEditsOnlyAllow: true,
  },
]

function main() {
  console.log("OpenClaw root:", OPENCLAW_ROOT)
  console.log("Tools file:", TOOLS_FILE)
  const patch = loadPatchValidator()

  let passed = 0
  let failed = 0

  for (const tc of CASES) {
    const hook = hookEvaluateEdit(tc.tool, tc.params)
    let hookAllow = hook.action === "allow"
    let hookReason = hook.action === "block" ? hook.reason : null

    // Hook only guarded edits; upstream assertRequiredParams still ran afterward.
    if (hookAllow && tc.tool === "edit" && !tc.hookOnly) {
      const upstream = patch.validateEdit(tc.params)
      if (!upstream.ok) {
        hookAllow = false
        hookReason = normalizePatchMessage(upstream.message)
      }
    }

    if (tc.hookOnly) {
      if (hookAllow === tc.expectAllow) {
        console.log(`✓ [hook-only] ${tc.name}`)
        passed++
      } else {
        console.error(`✗ [hook-only] ${tc.name}`)
        failed++
      }
      continue
    }

    const patchResult = patch.validateEdit(tc.params)
    const patchAllow = patchResult.ok
    const patchReason = patchResult.ok ? null : normalizePatchMessage(patchResult.message)

    const vanillaResult = patch.validateEditVanilla(tc.params)
    const vanillaReason = vanillaResult.ok ? null : normalizePatchMessage(vanillaResult.message)

    const errors = []

    if (hookAllow !== tc.expectAllow) {
      errors.push(`hook allow=${hookAllow}, expected ${tc.expectAllow}`)
    }
    if (patchAllow !== tc.expectAllow) {
      errors.push(`patch allow=${patchAllow}, expected ${tc.expectAllow}`)
    }
    if (hookAllow !== patchAllow) {
      errors.push(`hook/patch allow mismatch: hook=${hookAllow} patch=${patchAllow}`)
    }
    if (!hookAllow && !patchAllow && hookReason !== patchReason) {
      errors.push(`message mismatch:\n  hook:  ${hookReason}\n  patch: ${patchReason}`)
    }
    if (tc.expectMessage && hookReason !== tc.expectMessage) {
      errors.push(`hook message unexpected: ${hookReason}`)
    }
    if (tc.expectMessage && patchReason !== tc.expectMessage) {
      errors.push(`patch message unexpected: ${patchReason}`)
    }
    if (tc.expectMessageIncludes && (!patchReason || !patchReason.includes(tc.expectMessageIncludes))) {
      errors.push(`patch missing fragment: ${tc.expectMessageIncludes}`)
    }
    if (tc.mustNotContain && patchReason && patchReason.includes(tc.mustNotContain)) {
      errors.push(`patch still contains forbidden text: ${tc.mustNotContain}`)
    }

    if (tc.hookEditsOnlyAllow && hook.action !== "allow") {
      errors.push(`hook should allow at edits layer (upstream catches path)`)
    }
    if (tc.name === "empty oldText (primary bug)" && vanillaReason?.includes("Missing required parameter: edits")) {
      console.log(`  (baseline) vanilla upstream misreports: ${vanillaReason}`)
    }

    if (errors.length === 0) {
      console.log(`✓ ${tc.name}`)
      if (hookReason) console.log(`    → ${hookReason}`)
      passed++
    } else {
      console.error(`✗ ${tc.name}`)
      for (const e of errors) console.error(`    ${e}`)
      failed++
    }
  }

  console.log("---")
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
  console.log("Migration equivalence OK: patch matches former hook for all edit validation cases.")
}

main()
