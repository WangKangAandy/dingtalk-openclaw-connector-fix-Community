#!/usr/bin/env bash
# Patch: empty final synthesis after tool loop → incomplete + model fallback (v2, narrowed)
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENCLAW_ROOT="${OPENCLAW_ROOT:-$(npm root -g)/openclaw}"
PATCH_FILE="$PATCH_DIR/patch.diff"
VERSION_FILE="$OPENCLAW_ROOT/package.json"
EXPECTED_VERSION="2026.5.7"

if [[ ! -f "$PATCH_FILE" ]]; then
  echo "Patch file not found: $PATCH_FILE" >&2
  exit 1
fi

if [[ ! -d "$OPENCLAW_ROOT/dist" ]]; then
  echo "OpenClaw dist not found at: $OPENCLAW_ROOT" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1 && [[ -f "$VERSION_FILE" ]]; then
  OPENCLAW_VERSION="$(jq -r .version "$VERSION_FILE")"
  echo "OpenClaw version: $OPENCLAW_VERSION"
  if [[ "$OPENCLAW_VERSION" != "$EXPECTED_VERSION" ]]; then
    echo "WARNING: patch targets $EXPECTED_VERSION; current is $OPENCLAW_VERSION — review hunks before applying." >&2
  fi
fi

echo "Applying empty-synthesis-after-tool-loop (v2) to $OPENCLAW_ROOT ..."
cd "$OPENCLAW_ROOT"
if patch -p1 --forward --batch < "$PATCH_FILE"; then
  echo "Patch applied successfully."
else
  if grep -q "isEmptyFinalSynthesisAfterToolLoop" dist/selection-BeP8qtCb.js dist/result-fallback-classifier-CrVa7J1V.js 2>/dev/null; then
    echo "Patch already applied."
  else
    echo "Patch failed. See README.md for manual steps." >&2
    exit 1
  fi
fi
