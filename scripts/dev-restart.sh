#!/usr/bin/env bash
# Safe dev-server restart. Always run this instead of bare `npm run dev`
# if you suspect anything is off — it kills any prior dev server first
# (yours or Claude Code's), wipes the corrupted Turbopack cache, then
# starts a single clean instance bound to :3000.
#
# Why this script exists: Turbopack's cache database (`.next/dev/cache/
# turbopack/`) is single-writer. Two `next dev` processes pointed at the
# same project will race on SST file compaction and quickly corrupt the
# cache, producing errors like:
#
#   Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
#   ENOENT: no such file or directory, open '...app-paths-manifest.json'
#   Unable to open static sorted file 00000151.sst
#
# This happened repeatedly during 13.5c / 14.5 because:
#   1. Claude Code background-spawned dev servers ("nohup ... &
#      disown") got orphaned to launchd (PPID=1) when the agent's
#      turn ended.
#   2. Mahmud's manual `npm run dev` after seeing corruption added a
#      second process without killing the first.
# This script kills BOTH owners.

set -euo pipefail

cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")/.."
echo "[dev-restart] cwd: $(pwd)"

echo "[dev-restart] killing any existing next dev / next-server processes…"
/usr/bin/pkill -9 -f "next dev"     2>/dev/null || true
/usr/bin/pkill -9 -f "next-server"  2>/dev/null || true
/usr/bin/pkill -9 -f "next/dist"    2>/dev/null || true

# Free the dev port even if the process didn't match the patterns above.
for port in 3000 3001; do
  pids=$(/usr/sbin/lsof -ti ":$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "[dev-restart] killing PIDs holding :$port → $pids"
    echo "$pids" | /usr/bin/xargs -r kill -9 2>/dev/null || true
  fi
done

sleep 2

echo "[dev-restart] wiping caches (.next, node_modules/.cache, .turbo)…"
rm -rf .next node_modules/.cache .turbo

echo "[dev-restart] verification:"
remaining=$(ps -axo pid,command | /usr/bin/grep -iE "next dev|next-server" | /usr/bin/grep -v grep || true)
if [[ -n "$remaining" ]]; then
  echo "[dev-restart] ✗ next processes still running:"
  echo "$remaining"
  exit 1
fi
port_holder=$(/usr/sbin/lsof -ti :3000 2>/dev/null || true)
if [[ -n "$port_holder" ]]; then
  echo "[dev-restart] ✗ port 3000 still held by PID $port_holder"
  exit 1
fi
echo "[dev-restart] ✓ no stale processes, port 3000 free, caches wiped"

echo "[dev-restart] starting npm run dev (foreground)…"
exec /usr/bin/env npm run dev
