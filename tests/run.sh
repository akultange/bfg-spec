#!/usr/bin/env bash
# Builds the app, starts it locally against a fresh local D1 database, and runs the break tests.
set -euo pipefail
cd "$(dirname "$0")/.."
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
PORT="${PORT:-8799}"
mkdir -p test-results

npm run build > test-results/build.log 2>&1
rm -rf .wrangler/state
npx wrangler d1 migrations apply DB --local --config wrangler.json > test-results/migrate.log 2>&1

npx wrangler dev --port "$PORT" --ip 127.0.0.1 --var TURNSTILE_MODE:off > test-results/wrangler.log 2>&1 &
cleanup() { pkill -f "wrangler dev --port $PORT" 2>/dev/null || true; pkill -f "workerd.*$PORT" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/register/" && break
  sleep 1
done

BFG_BASE="http://127.0.0.1:$PORT/register" python3 -m pytest -q tests "$@"
