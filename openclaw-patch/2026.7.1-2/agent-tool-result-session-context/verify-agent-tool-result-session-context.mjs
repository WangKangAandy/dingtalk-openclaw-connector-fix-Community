#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(process.argv[2] ?? process.cwd())
const dist = path.join(root, "dist")

function uniqueFileContaining(anchor) {
  const matches = fs.readdirSync(dist)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => fs.readFileSync(path.join(dist, name), "utf8").includes(anchor))
  if (matches.length !== 1) throw new Error(`expected one dist bundle for ${anchor}, found ${matches.length}`)
  return path.join(dist, matches[0])
}

const factoryFile = uniqueFileContaining("function buildAgentToolResultMiddlewareFactory(sessionManager, context)")
const factorySource = fs.readFileSync(factoryFile, "utf8")
for (const anchor of [
  'createAgentToolResultMiddlewareRunner({ runtime: "openclaw", ...context })',
  "agentId: params.agentId",
  "sessionId: params.sessionId",
  "sessionKey: params.sessionKey",
  "runId: params.runId",
]) {
  if (!factorySource.includes(anchor)) throw new Error(`patched factory anchor missing: ${anchor}`)
}

function assertFactoryCallContext(source, label, anchors) {
  const marker = "extensionFactories: buildEmbeddedExtensionFactories({"
  const first = source.indexOf(marker)
  if (first < 0 || source.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`${label} buildEmbeddedExtensionFactories call is missing or not unique`)
  }
  const call = source.slice(first, first + 600)
  for (const anchor of anchors) {
    if (!call.includes(anchor)) throw new Error(`${label} context anchor missing from factory call: ${anchor}`)
  }
}

const selectionSource = fs.readFileSync(uniqueFileContaining("async function runEmbeddedAttempt(params)"), "utf8")
assertFactoryCallContext(selectionSource, "normal attempt", [
  "agentId: sessionAgentId",
  "sessionId: params.sessionId",
  "sessionKey: params.sessionKey",
  "runId: params.runId",
])
const compactSource = fs.readFileSync(uniqueFileContaining("async function compactEmbeddedAgentSessionDirectOnce(params)"), "utf8")
assertFactoryCallContext(compactSource, "compaction", [
  "agentId: sessionAgentId",
  "sessionId: params.sessionId",
  "sessionKey: params.sessionKey",
  "runId",
])

const start = factorySource.indexOf("function buildAgentToolResultMiddlewareFactory(sessionManager, context)")
const end = factorySource.indexOf("\nfunction resolveContextWindowTokens", start)
if (start < 0 || end < 0) throw new Error("cannot isolate middleware factory source")
const isolated = factorySource.slice(start, end)
const observed = []
const buildFactory = new Function(
  "createAgentToolResultMiddlewareRunner",
  "recordFromUnknown",
  "snapshotToolSendReceipt",
  "recordEmbeddedToolSendReceipt",
  "isToolResultError",
  "peekAdjustedParamsForToolCall",
  "normalizeAcceptedSessionSpawnResult",
  "finalizeToolTerminalPresentation",
  "randomUUID",
  `${isolated}; return buildAgentToolResultMiddlewareFactory;`,
)(
  (context) => {
    observed.push({ ...context })
    return { applyToolResultMiddleware: async (event) => event.result }
  },
  (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
  () => undefined,
  () => undefined,
  () => false,
  () => undefined,
  () => null,
  () => undefined,
  () => "generated",
)

async function exercise(context, toolCallId) {
  let handler
  const factory = buildFactory({}, context)
  factory({ on(name, callback) { if (name === "tool_result") handler = callback } })
  if (!handler) throw new Error("factory did not register tool_result handler")
  await handler({ toolName: "memory_search", toolCallId, input: {}, content: [], details: {} }, { cwd: "/tmp" })
}

const first = { agentId: "agent-a", sessionId: "session-a", sessionKey: "key-a", runId: "run-a" }
const second = { agentId: "agent-b", sessionId: "session-b", sessionKey: "key-b", runId: "run-b" }
await Promise.all([exercise(first, "call-a"), exercise(second, "call-b")])
if (JSON.stringify(observed) !== JSON.stringify([
  { runtime: "openclaw", ...first },
  { runtime: "openclaw", ...second },
])) {
  throw new Error(`middleware contexts crossed or changed: ${JSON.stringify(observed)}`)
}
console.log("agent tool result middleware session context verifier passed")
