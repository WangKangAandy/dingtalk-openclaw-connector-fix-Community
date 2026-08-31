import type { OpenClawAgentToolResult } from "openclaw/plugin-sdk/agent-harness"

import { isMemoryPathAllowed, normalizeMemoryHitPath, verifyPathInsideWorkspace } from "./path-classifier.ts"
import type { DingtalkMemoryScope } from "./types.ts"

type JsonRecord = Record<string, unknown>

export class MemorySearchResultValidationError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function inferCorpus(hit: JsonRecord): string | null {
  if (typeof hit.corpus === "string") return hit.corpus.toLowerCase()
  if (typeof hit.source === "string") return hit.source.toLowerCase()
  return null
}

function isExplicitPublicSupplement(hit: JsonRecord): boolean {
  if (hit.visibility === "public" || hit.privacyTier === "public") return true
  return isRecord(hit.metadata)
    && (hit.metadata.visibility === "public" || hit.metadata.privacyTier === "public")
}

function filterHit(
  hit: unknown,
  scope: DingtalkMemoryScope,
  workspaceDir?: string,
): JsonRecord | null {
  if (!isRecord(hit)) return null
  const corpus = inferCorpus(hit)
  if (corpus === "sessions") return null
  if (corpus === "wiki") return isExplicitPublicSupplement(hit) ? hit : null
  if (corpus !== "memory") return null

  const normalized = normalizeMemoryHitPath(hit.path)
  if (normalized.kind !== "valid" || !isMemoryPathAllowed(normalized.path, scope)) return null
  if (workspaceDir) {
    const verified = verifyPathInsideWorkspace(workspaceDir, normalized.path)
    if (!verified.ok || !isMemoryPathAllowed(verified.relativePath, scope)) return null
  }
  return normalized.path === hit.path ? hit : { ...hit, path: normalized.path }
}

export function filterMemorySearchPayload(
  payload: unknown,
  scope: DingtalkMemoryScope,
  workspaceDir?: string,
): JsonRecord {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new MemorySearchResultValidationError("memory_search payload has no results array")
  }
  if (payload.debug !== undefined && !isRecord(payload.debug)) {
    throw new MemorySearchResultValidationError("memory_search payload.debug is not an object")
  }
  const results = payload.results
    .map((hit) => filterHit(hit, scope, workspaceDir))
    .filter((hit): hit is JsonRecord => hit !== null)
  const debug = isRecord(payload.debug) ? { ...payload.debug, hits: results.length } : payload.debug
  return { ...payload, results, ...(debug !== undefined ? { debug } : {}) }
}

function parseVisiblePayload(result: OpenClawAgentToolResult): JsonRecord {
  if (!isRecord(result.details)) {
    throw new MemorySearchResultValidationError("memory_search result.details is not an object")
  }
  if (!Array.isArray(result.content) || result.content.length !== 1) {
    throw new MemorySearchResultValidationError("memory_search result.content is not a single block")
  }
  const first = result.content[0]
  if (!isRecord(first) || first.type !== "text" || typeof first.text !== "string") {
    throw new MemorySearchResultValidationError("memory_search result.content[0] is not text")
  }
  let contentPayload: unknown
  try {
    contentPayload = JSON.parse(first.text)
  } catch {
    throw new MemorySearchResultValidationError("memory_search result.content text is not JSON")
  }
  if (!isRecord(contentPayload) || JSON.stringify(contentPayload) !== JSON.stringify(result.details)) {
    throw new MemorySearchResultValidationError("memory_search content and details payloads differ")
  }
  return result.details
}

export function buildSafeMemorySearchResult(
  result: OpenClawAgentToolResult,
  reason: string,
): OpenClawAgentToolResult {
  const payload = {
    results: [],
    disabled: true,
    error: "memory scope isolation rejected an untrusted search result",
    debug: { hits: 0, isolation: "fail-closed", reason },
  }
  return {
    ...result,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  }
}

export function filterMemorySearchToolResult(
  result: OpenClawAgentToolResult,
  scope: DingtalkMemoryScope,
  workspaceDir?: string,
): OpenClawAgentToolResult {
  const payload = filterMemorySearchPayload(parseVisiblePayload(result), scope, workspaceDir)
  return {
    ...result,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  }
}
