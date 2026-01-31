#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACK_PORT=8000
FRONT_PORT=5173

kill_port() {
  local port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    echo "lsof not found; cannot auto-stop port ${port}."
    return
  fi
  local pids
  pids="$(lsof -ti "tcp:${port}" || true)"
  if [[ -z "$pids" ]]; then
    return
  fi
  echo "Stopping process(es) on port ${port}: ${pids}"
  kill ${pids} 2>/dev/null || true
  sleep 1
  pids="$(lsof -ti "tcp:${port}" || true)"
  if [[ -n "$pids" ]]; then
    echo "Force-stopping process(es) on port ${port}: ${pids}"
    kill -9 ${pids} 2>/dev/null || true
  fi
}

kill_port "$BACK_PORT"
kill_port "$FRONT_PORT"

( cd "$ROOT_DIR" && poetry run uvicorn backend.api:app --reload --port "$BACK_PORT" ) &
BACK_PID=$!

( cd "$ROOT_DIR/frontend" && VITE_API_BASE="http://localhost:${BACK_PORT}" npm run dev -- --host 127.0.0.1 --port "$FRONT_PORT" --strictPort ) &
FRONT_PID=$!

trap 'kill $BACK_PID $FRONT_PID 2>/dev/null || true' EXIT
wait
