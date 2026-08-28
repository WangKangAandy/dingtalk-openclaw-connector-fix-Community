#!/usr/bin/env bash
set -euo pipefail

EXPECTED_VERSION="2026.7.1-2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_ROOT="${1:-${OPENCLAW_ROOT:-}}"
if [[ -z "$OPENCLAW_ROOT" ]]; then
  OPENCLAW_BIN="$(command -v openclaw)"
  OPENCLAW_ROOT="$(dirname "$(readlink -f "$OPENCLAW_BIN")")"
fi

ACTUAL_VERSION="$(node -p "require(process.argv[1]).version" "$OPENCLAW_ROOT/package.json")"
if [[ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "version mismatch: expected $EXPECTED_VERSION, got $ACTUAL_VERSION" >&2
  exit 1
fi

mapfile -t FACTORY_FILES < <(grep -l 'function buildAgentToolResultMiddlewareFactory' "$OPENCLAW_ROOT"/dist/*.js)
mapfile -t ATTEMPT_FILES < <(grep -l 'async function runEmbeddedAttempt(params)' "$OPENCLAW_ROOT"/dist/*.js)
mapfile -t COMPACT_FILES < <(grep -l 'async function compactEmbeddedAgentSessionDirectOnce(params)' "$OPENCLAW_ROOT"/dist/*.js)
if [[ ${#FACTORY_FILES[@]} -ne 1 || ${#ATTEMPT_FILES[@]} -ne 1 || ${#COMPACT_FILES[@]} -ne 1 ]]; then
  echo "required bundle anchors are not unique" >&2
  exit 1
fi

if node "$SCRIPT_DIR/verify-agent-tool-result-session-context.mjs" "$OPENCLAW_ROOT" >/dev/null 2>&1; then
  echo "patch already applied and verified"
  exit 0
fi

grep -q 'createAgentToolResultMiddlewareRunner({ runtime: "openclaw" })' "${FACTORY_FILES[0]}"
grep -q 'factories.push(buildAgentToolResultMiddlewareFactory(params.sessionManager, params.runId))' "${FACTORY_FILES[0]}"

TARGETS=("${FACTORY_FILES[0]}" "${ATTEMPT_FILES[0]}" "${COMPACT_FILES[0]}")
for target in "${TARGETS[@]}"; do
  cp -p "$target" "$target.dingtalk-memory-scope.bak"
done
restore() {
  for target in "${TARGETS[@]}"; do
    cp -p "$target.dingtalk-memory-scope.bak" "$target"
  done
}
trap restore ERR

patch -d "$OPENCLAW_ROOT" -p1 --forward --fuzz=0 < "$SCRIPT_DIR/patch.diff"
for target in "${TARGETS[@]}"; do
  node --check "$target"
done
node "$SCRIPT_DIR/verify-agent-tool-result-session-context.mjs" "$OPENCLAW_ROOT"
trap - ERR
echo "patch applied; Gateway was not restarted"
