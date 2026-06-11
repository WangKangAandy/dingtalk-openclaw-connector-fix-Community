#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OPENCLAW_ROOT="${OPENCLAW_ROOT:-$(npm root -g)/openclaw}"
VERSION_FILE="$OPENCLAW_ROOT/package.json"

if [[ ! -f "$VERSION_FILE" ]]; then
  echo "OpenClaw not found at: $OPENCLAW_ROOT" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  OPENCLAW_VERSION="$(jq -r .version "$VERSION_FILE")"
else
  OPENCLAW_VERSION="$(node -p "require('$VERSION_FILE').version")"
fi

PATCH_DIR="$ROOT/$OPENCLAW_VERSION"
echo "OpenClaw version: $OPENCLAW_VERSION"
echo "Patch directory:  $PATCH_DIR"

if [[ ! -d "$PATCH_DIR" ]]; then
  echo "No patch directory for version $OPENCLAW_VERSION" >&2
  exit 1
fi

applied=0
shopt -s nullglob
for apply_script in "$PATCH_DIR"/*/apply.sh; do
  echo "---"
  echo "Running $(basename "$(dirname "$apply_script")")..."
  OPENCLAW_ROOT="$OPENCLAW_ROOT" bash "$apply_script"
  applied=$((applied + 1))
done

if [[ "$applied" -eq 0 ]]; then
  echo "No apply.sh scripts found under $PATCH_DIR" >&2
  exit 1
fi

echo "---"
echo "Applied $applied patch(es). Restart: systemctl --user restart openclaw-gateway"
