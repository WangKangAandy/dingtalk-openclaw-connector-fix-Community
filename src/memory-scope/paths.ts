import fs from "node:fs"
import path from "node:path"

import { GLOBAL_DAILY_MEMORY_PATTERN, ROOT_MEMORY_FILENAME } from "./constants.ts"
import { TOPIC_ISSUE_FILES } from "./topic-issue-files.ts"
import type { DingtalkMemoryScope } from "./types.ts"

export function resolveWithinWorkspace(workspaceDir: string, input: string): string | null {
  const ws = path.resolve(workspaceDir)
  const abs = path.isAbsolute(input) ? path.resolve(input) : path.resolve(ws, input)
  const rel = path.relative(ws, abs)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null
  return abs
}

export function toWorkspaceRelativePath(workspaceDir: string, absPath: string): string | null {
  const ws = path.resolve(workspaceDir)
  const resolved = path.resolve(absPath)
  const rel = path.relative(ws, resolved)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join("/")
}

export function isRootWorkspaceMemoryRelPath(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/")
  return normalized === ROOT_MEMORY_FILENAME || normalized === "memory.md"
}

export function isMemoryTreeRelPath(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/")
  return normalized === ROOT_MEMORY_FILENAME
    || normalized === "memory.md"
    || normalized.startsWith("memory/")
}

export function isPathAllowedForScope(scope: DingtalkMemoryScope, relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/")
  if (!isMemoryTreeRelPath(normalized)) return true
  if (isRootWorkspaceMemoryRelPath(normalized)) return false
  const prefix = `${scope.scopeDir}/`
  return normalized === scope.scopeDir || normalized.startsWith(prefix)
}

export function rewriteMemoryWritePath(scope: DingtalkMemoryScope, relPath: string): string {
  const normalized = relPath.split(path.sep).join("/")

  if (normalized === ROOT_MEMORY_FILENAME || normalized === "memory.md") {
    return scope.memoryFile
  }

  const dailyMatch = GLOBAL_DAILY_MEMORY_PATTERN.exec(normalized)
  if (dailyMatch) {
    return `${scope.scopeDir}/${dailyMatch[1]}.md`
  }

  if (normalized.startsWith("memory/") && !normalized.startsWith(`${scope.scopeDir}/`)) {
    const remainder = normalized.slice("memory/".length)
    return `${scope.scopeDir}/${remainder}`
  }

  return relPath
}

export function ensureScopeDirectory(workspaceDir: string, scope: DingtalkMemoryScope): void {
  const absDir = path.resolve(workspaceDir, scope.scopeDir)
  fs.mkdirSync(absDir, { recursive: true })
}

export function buildDefaultScopedMemoryContent(scope: DingtalkMemoryScope): string {
  const label = scope.chatType === "direct" ? `用户 ${scope.peerId}` : `群聊 ${scope.peerId}`
  return [
    `# MEMORY.md - ${label} 专属长期记忆`,
    "",
    "> 路径见 system prompt「本 session 记忆路径」。",
    "> 纪律见 workspace 根 `MEMORY.md` 标记段。",
    `> 专题 issue：钉钉 \`${TOPIC_ISSUE_FILES.dingtalk}\`；MUSA \`${TOPIC_ISSUE_FILES.musaStack}\`；OpenClaw \`${TOPIC_ISSUE_FILES.openclaw}\`。`,
    "",
  ].join("\n")
}

export function ensureScopedMemoryFile(workspaceDir: string, scope: DingtalkMemoryScope): string {
  ensureScopeDirectory(workspaceDir, scope)
  const absPath = path.resolve(workspaceDir, scope.memoryFile)
  if (!fs.existsSync(absPath)) {
    fs.writeFileSync(absPath, buildDefaultScopedMemoryContent(scope), "utf8")
  }
  return absPath
}

export function readRootMemoryBootstrapEntry(
  workspaceDir: string,
): { name: string; path: string; content?: string; missing: boolean } {
  const absPath = path.resolve(workspaceDir, ROOT_MEMORY_FILENAME)
  if (!fs.existsSync(absPath)) {
    return {
      name: ROOT_MEMORY_FILENAME,
      path: absPath,
      missing: true,
    }
  }

  return {
    name: ROOT_MEMORY_FILENAME,
    path: absPath,
    content: fs.readFileSync(absPath, "utf8"),
    missing: false,
  }
}

export function readScopedMemoryBootstrapEntry(
  workspaceDir: string,
  scope: DingtalkMemoryScope,
): { name: string; path: string; content?: string; missing: boolean } {
  const absPath = ensureScopedMemoryFile(workspaceDir, scope)

  return {
    name: ROOT_MEMORY_FILENAME,
    path: absPath,
    content: fs.readFileSync(absPath, "utf8"),
    missing: false,
  }
}

export function extractToolPath(params: Record<string, unknown>): string | null {
  for (const key of ["path", "file_path", "filePath"]) {
    const value = params[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}
