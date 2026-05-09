#!/usr/bin/env bash
# Safe dev-server restart + Stripe webhook listener. Always run this
# instead of bare `npm run dev` — it kills any prior dev server (yours
# or Claude Code's), wipes the corrupted Turbopack cache, starts a
# single clean instance bound to :3000, and (if the Stripe CLI is
# installed and authenticated) spawns `stripe listen` so webhooks
# deliver to localhost without a separate terminal.
#
# Why this script exists:
#
# 1. Turbopack's cache database (`.next/dev/cache/turbopack/`) is
#    single-writer. Two `next dev` processes pointed at the same
#    project will race on SST file compaction and quickly corrupt
#    the cache, producing errors like:
#
#      Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
#      ENOENT: no such file or directory, open '...app-paths-manifest.json'
#      Unable to open static sorted file 00000151.sst
#
#    This happened repeatedly during 13.5c / 14.5 because Claude
#    Code background-spawned dev servers ("nohup ... & disown") got
#    orphaned to launchd (PPID=1), and manual `npm run dev` calls
#    added competing instances. This script kills BOTH owners.
#
# 2. Stripe webhooks won't reach localhost without `stripe listen`.
#    Forgetting to start it manually has cost real debugging time
#    (test checkouts get stuck in "Still processing"). This script
#    starts it alongside Next so webhook delivery just works.
#
# Stops both processes cleanly on Ctrl+C via a SIGINT/SIGTERM trap.

set -euo pipefail

cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")/.."
echo "[dev-restart] cwd: $(pwd)"

# ─── Kill any prior next + stripe listen instances ─────────────────────
echo "[dev-restart] killing any existing next dev / next-server processes…"
/usr/bin/pkill -9 -f "next dev"      2>/dev/null || true
/usr/bin/pkill -9 -f "next-server"   2>/dev/null || true
/usr/bin/pkill -9 -f "next/dist"     2>/dev/null || true

echo "[dev-restart] killing any existing 'stripe listen' processes…"
/usr/bin/pkill -9 -f "stripe listen" 2>/dev/null || true

# Free the dev port even if the process didn't match the patterns above.
for port in 3000 3001; do
  pids=$(/usr/sbin/lsof -ti ":$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "[dev-restart] killing PIDs holding :$port → $pids"
    echo "$pids" | /usr/bin/xargs -r kill -9 2>/dev/null || true
  fi
done

sleep 2

# ─── Wipe caches ───────────────────────────────────────────────────────
echo "[dev-restart] wiping caches (.next, node_modules/.cache, .turbo)…"
rm -rf .next node_modules/.cache .turbo

# ─── Verify clean state ────────────────────────────────────────────────
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

# ─── Stripe CLI preflight ──────────────────────────────────────────────
# We spawn `stripe listen` AFTER the dev server is healthy so its
# forwarded events have somewhere to land. First check the binary is
# available + authenticated; if not, warn loudly and continue without
# it (the dev server still works for non-checkout pages).
STRIPE_OK=0
if /usr/bin/command -v stripe >/dev/null 2>&1; then
  # `stripe config --list` exits non-zero if not authenticated. Use
  # it as the auth probe.
  if stripe config --list >/dev/null 2>&1; then
    STRIPE_OK=1
  else
    echo "[dev-restart] ⚠ Stripe CLI installed but not authenticated."
    echo "                Run: stripe login"
  fi
else
  echo "[dev-restart] ⚠ Stripe CLI not found on PATH."
  echo "                Install: brew install stripe/stripe-cli/stripe"
  echo "                Login:   stripe login"
fi
if [[ "$STRIPE_OK" != "1" ]]; then
  echo "[dev-restart] ⚠ Webhooks WILL NOT deliver to localhost. Test"
  echo "                checkouts will get stuck in \"Still processing\""
  echo "                until you start \`stripe listen\` manually."
fi

# ─── Spawn dev server in background ────────────────────────────────────
DEV_LOG="/tmp/og-dev.log"
STRIPE_LOG="/tmp/og-stripe.log"

echo "[dev-restart] starting npm run dev → $DEV_LOG"
/usr/bin/env npm run dev > "$DEV_LOG" 2>&1 &
DEV_PID=$!

# Cleanup on Ctrl+C (and on EXIT for safety). Kills BOTH children
# regardless of which one is causing the shutdown.
STRIPE_PID=""
cleanup() {
  echo
  echo "[dev-restart] shutting down…"
  if [[ -n "${STRIPE_PID}" ]]; then
    kill "$STRIPE_PID" 2>/dev/null || true
  fi
  if [[ -n "${DEV_PID}" ]]; then
    kill "$DEV_PID" 2>/dev/null || true
  fi
  # Defensive: also pkill in case the kill above raced.
  /usr/bin/pkill -P $$ 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# Wait for "Ready in" before forwarding webhooks (otherwise the first
# few events 502 against an unbooted server).
echo "[dev-restart] waiting for next dev to be ready…"
for i in $(seq 1 60); do
  if /usr/bin/grep -q "Ready in" "$DEV_LOG" 2>/dev/null; then
    echo "[dev-restart] ✓ next dev ready (PID=$DEV_PID) after ${i}s"
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "[dev-restart] ✗ npm run dev exited before becoming ready. Last log lines:"
    /usr/bin/tail -20 "$DEV_LOG" || true
    exit 1
  fi
  sleep 1
done

# ─── Spawn stripe listen in background (if available) ──────────────────
if [[ "$STRIPE_OK" == "1" ]]; then
  echo "[dev-restart] starting stripe listen → $STRIPE_LOG"
  stripe listen --forward-to localhost:3000/api/webhooks/stripe \
    > "$STRIPE_LOG" 2>&1 &
  STRIPE_PID=$!
  # Brief sanity check — stripe listen prints a webhook secret line
  # within ~2s of starting.
  sleep 2
  if kill -0 "$STRIPE_PID" 2>/dev/null; then
    echo "[dev-restart] ✓ stripe listen running (PID=$STRIPE_PID)"
  else
    echo "[dev-restart] ✗ stripe listen exited immediately. Last log lines:"
    /usr/bin/tail -10 "$STRIPE_LOG" || true
    STRIPE_PID=""
  fi
fi

echo
echo "[dev-restart] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[dev-restart] dev:    http://localhost:3000  (PID=$DEV_PID)"
if [[ -n "$STRIPE_PID" ]]; then
  echo "[dev-restart] stripe: forwarding to /api/webhooks/stripe (PID=$STRIPE_PID)"
fi
echo "[dev-restart] tail:   tail -F $DEV_LOG"
if [[ -n "$STRIPE_PID" ]]; then
  echo "[dev-restart]         tail -F $STRIPE_LOG"
fi
echo "[dev-restart] Ctrl+C to stop both."
echo "[dev-restart] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Block until either child exits. `wait` without args waits for ANY
# background child; the trap then cleans up the other.
wait
