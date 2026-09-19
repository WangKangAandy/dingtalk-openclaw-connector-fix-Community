import fs from "node:fs"
import path from "node:path"

function inside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

/** Resolve a path while canonicalizing the nearest existing parent. */
function canonicalTarget(target: string): string | null {
  let cursor = path.resolve(target)
  const suffix: string[] = []
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) return null
    suffix.unshift(path.basename(cursor))
    cursor = parent
  }
  try {
    return path.resolve(fs.realpathSync(cursor), ...suffix)
  } catch {
    return null
  }
}

export function resolveConfiguredRoots(workspaceDir: string | undefined, configured: string[]): string[] {
  const workspace = workspaceDir?.trim() ? path.resolve(workspaceDir) : undefined
  return configured
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.isAbsolute(entry) ? entry : workspace ? path.resolve(workspace, entry) : null)
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => canonicalTarget(entry))
    .filter((entry): entry is string => Boolean(entry))
}

export function resolveToolTarget(workspaceDir: string | undefined, rawPath: string): string | null {
  const value = rawPath.trim()
  if (!value || value.includes("\0")) return null
  const target = path.isAbsolute(value)
    ? path.resolve(value)
    : workspaceDir?.trim()
      ? path.resolve(workspaceDir, value)
      : null
  return target ? canonicalTarget(target) : null
}

export function isProductionTarget(target: string, roots: readonly string[]): boolean {
  const canonical = canonicalTarget(target)
  return canonical ? roots.some((root) => inside(canonical, root)) : false
}

export function commandMentionsProduction(command: string, roots: readonly string[], workspaceDir?: string): boolean {
  const raw = command.trim()
  if (!raw) return false
  return roots.some((root) => raw.includes(root) || (workspaceDir && raw.includes(path.relative(workspaceDir, root))))
}
