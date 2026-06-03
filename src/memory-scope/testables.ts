import { applyScopedBootstrapFiles } from "./bootstrap-handler.ts"
import { resolveMemoryScopeConfig } from "./config.ts"
import {
  extractToolPath,
  isPathAllowedForScope,
  rewriteMemoryWritePath,
} from "./paths.ts"
import { parseDingtalkMemoryScope } from "./session-scope.ts"
import { evaluateMemoryToolCall } from "./tool-guard.ts"

export const __memoryScopeTestables = {
  applyScopedBootstrapFiles,
  resolveMemoryScopeConfig,
  extractToolPath,
  isPathAllowedForScope,
  rewriteMemoryWritePath,
  parseDingtalkMemoryScope,
  evaluateMemoryToolCall,
}
