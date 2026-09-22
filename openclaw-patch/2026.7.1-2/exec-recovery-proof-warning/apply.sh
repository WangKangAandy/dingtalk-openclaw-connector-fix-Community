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

if node "$SCRIPT_DIR/verify-exec-recovery-proof.mjs" "$OPENCLAW_ROOT" >/dev/null 2>&1; then
  echo "patch already applied and verified"
  exit 0
fi

mapfile -t PAYLOAD_FILES < <(grep -l 'function resolveToolErrorWarningPolicy' "$OPENCLAW_ROOT"/dist/*.js)
if [[ ${#PAYLOAD_FILES[@]} -ne 1 ]]; then
  echo "resolveToolErrorWarningPolicy anchor is not unique (${#PAYLOAD_FILES[@]} hits)" >&2
  exit 1
fi

TARGET="${PAYLOAD_FILES[0]}"
cp -p "$TARGET" "$TARGET.exec-recovery-proof.bak"
restore() {
  cp -p "$TARGET.exec-recovery-proof.bak" "$TARGET"
}
trap restore ERR

node "$SCRIPT_DIR/apply-in-place.mjs" "$TARGET"
node --check "$TARGET"
node "$SCRIPT_DIR/verify-exec-recovery-proof.mjs" "$OPENCLAW_ROOT"
trap - ERR
echo "patch applied to $TARGET; Gateway was not restarted"
