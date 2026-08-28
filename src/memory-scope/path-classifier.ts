import fs from "node:fs"
import path from "node:path"

import { GROUPS_MEMORY_PREFIX, ROOT_MEMORY_FILENAME, USERS_MEMORY_PREFIX } from "./constants.ts"
import type { DingtalkMemoryScope } from "./types.ts"

export type NormalizedMemoryPath =
  | { kind: "valid"; path: string }
  | { kind: "invalid"; reason: string }

const ENCODED_BYTE = /%[0-9a-f]{2}/i

export function normalizeMemoryHitPath(input: unknown): NormalizedMemoryPath {
  if (typeof input !== "string") return { kind: "invalid", reason: "path is not a string" }
  const raw = input.trim()
  if (!raw) return { kind: "invalid", reason: "path is empty" }
  if (raw.includes("\0")) return { kind: "invalid", reason: "path contains NUL" }
  if (raw.includes("\\")) return { kind: "invalid", reason: "backslash paths are not accepted" }
  if (path.posix.isAbsolute(raw)) return { kind: "invalid", reason: "absolute paths are not accepted" }
  if (ENCODED_BYTE.test(raw)) {
    return { kind: "invalid", reason: "percent-encoded path bytes are not accepted" }
  }
  const segments = raw.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return { kind: "invalid", reason: "path contains an empty or traversal segment" }
  }
  return { kind: "valid", path: segments.join("/") }
}

function isAtOrBelow(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`)
}

export function isMemoryPathAllowed(pathValue: string, scope: DingtalkMemoryScope): boolean {
  if (pathValue === ROOT_MEMORY_FILENAME || pathValue === "memory.md") return true
  if (pathValue !== "memory" && !pathValue.startsWith("memory/")) return true

  if (isAtOrBelow(pathValue, scope.scopeDir)) {
    if (scope.chatType === "group" && !scope.scopeDir.includes("/users/")) {
      return !isAtOrBelow(pathValue, `${scope.scopeDir}/users`)
    }
    return true
  }
  if (isAtOrBelow(pathValue, USERS_MEMORY_PREFIX)) return false
  if (isAtOrBelow(pathValue, GROUPS_MEMORY_PREFIX)) return false
  return true
}

export function verifyPathInsideWorkspace(
  workspaceDir: string,
  relativePath: string,
): { ok: true; absolutePath: string } | { ok: false; reason: string } {
  const workspace = path.resolve(workspaceDir)
  const absolutePath = path.resolve(workspace, ...relativePath.split("/"))
  const lexicalRelative = path.relative(workspace, absolutePath)
  if (!lexicalRelative || lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) {
    return { ok: false, reason: "path escapes the workspace" }
  }
  try {
    const realWorkspace = fs.realpathSync(workspace)
    const realTarget = fs.realpathSync(absolutePath)
    const realRelative = path.relative(realWorkspace, realTarget)
    if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      return { ok: false, reason: "path escapes the workspace through a symlink" }
    }
    return { ok: true, absolutePath: realTarget }
  } catch (error) {
    return { ok: false, reason: `path cannot be resolved safely: ${String(error)}` }
  }
}
