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

export const __memoryScopeTestables = {
  applyScopedBootstrapFiles,
  resolveMemoryScopeConfig,
  ensureScopedMemoryFile,
  ensureRootMemoryScopeSection,
  buildMemoryScopePrompt,
  extractToolPath,
  isPathAllowedForScope,
  rewriteMemoryWritePath,
  parseDingtalkMemoryScope,
  evaluateMemoryToolCall,
}
