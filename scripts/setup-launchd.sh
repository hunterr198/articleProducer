#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLISTS=(
  "com.articleproducer.sample.plist"
  "com.articleproducer.aggregate.plist"
)

mkdir -p "$LAUNCH_AGENTS_DIR"

for plist in "${PLISTS[@]}"; do
  LABEL="${plist%.plist}"
  SRC="$SCRIPT_DIR/$plist"
  DST="$LAUNCH_AGENTS_DIR/$plist"

  echo "Processing $LABEL..."

  # Unload existing job (ignore errors if not loaded)
  launchctl unload "$DST" 2>/dev/null || true

  # Copy plist
  cp "$SRC" "$DST"
  echo "  Copied to $DST"

  # Load new job
  launchctl load "$DST"
  echo "  Loaded"
done

echo ""
echo "=== LaunchAgents status ==="
for plist in "${PLISTS[@]}"; do
  LABEL="${plist%.plist}"
  echo ""
  echo "--- $LABEL ---"
  launchctl list "$LABEL" 2>/dev/null || echo "  (not running)"
done
