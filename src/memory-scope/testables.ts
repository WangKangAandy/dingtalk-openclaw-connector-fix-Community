import { ensureAgentsMemoryScopeSections, agentsMemoryMarkersPresent } from "./agents-memory-sync.ts"
import { applyScopedBootstrapFiles } from "./bootstrap-handler.ts"
import { resolveMemoryScopeConfig } from "./config.ts"
import {
  ensureScopedMemoryFile,
  extractToolPath,
  isPathAllowedForScope,
  rewriteMemoryWritePath,
} from "./paths.ts"
import { buildMemoryScopePrompt } from "./prompt-handler.ts"
import { ensureRootMemoryScopeSection } from "./root-memory-sync.ts"
import { parseDingtalkMemoryScope } from "./session-scope.ts"
import { evaluateMemoryToolCall } from "./tool-guard.ts"
import { classifyDingtalkSession } from "./session-scope.ts"
import { isMemoryPathAllowed, normalizeMemoryHitPath } from "./path-classifier.ts"
import {
  buildSafeMemorySearchResult,
  filterMemorySearchPayload,
  filterMemorySearchToolResult,
} from "./search-result-filter.ts"
import { createMemorySearchResultMiddleware } from "./result-middleware.ts"

export const __memoryScopeTestables = {
  applyScopedBootstrapFiles,
  resolveMemoryScopeConfig,
  ensureScopedMemoryFile,
  ensureRootMemoryScopeSection,
  ensureAgentsMemoryScopeSections,
  agentsMemoryMarkersPresent,
  buildMemoryScopePrompt,
  extractToolPath,
  isPathAllowedForScope,
  rewriteMemoryWritePath,
  parseDingtalkMemoryScope,
  evaluateMemoryToolCall,
  classifyDingtalkSession,
  normalizeMemoryHitPath,
  isMemoryPathAllowed,
  filterMemorySearchPayload,
  filterMemorySearchToolResult,
  buildSafeMemorySearchResult,
  createMemorySearchResultMiddleware,
}
