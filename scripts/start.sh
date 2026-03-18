#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.next-server.pid"

echo "Building Next.js production bundle..."
cd "$PROJECT_DIR"
npx --yes pnpm run build

echo "Starting Next.js production server on port 3000..."
npx --yes pnpm run start -- -p 3000 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
echo "Server started with PID $SERVER_PID (saved to $PID_FILE)"
