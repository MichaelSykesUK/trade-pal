#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="/tmp/tradepal-dev-check.log"

bash "$ROOT_DIR/dev.sh" > "$LOG_FILE" 2>&1 &
DEV_PID=$!

cleanup() {
  kill "$DEV_PID" 2>/dev/null || true
  wait "$DEV_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting dev servers (logs: ${LOG_FILE})..."
echo "Waiting for backend + frontend to respond..."

backend_ok=0
frontend_ok=0
frontend_url="http://127.0.0.1:5173/"

for _ in {1..30}; do
  back_code="$(curl -s --connect-timeout 1 --max-time 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs || true)"
  front_code="$(curl -s --connect-timeout 1 --max-time 2 -o /dev/null -w "%{http_code}" "${frontend_url}" || true)"
  if [[ ! "$front_code" =~ ^(2|3) ]]; then
    front_code="$(curl -s --connect-timeout 1 --max-time 2 -o /dev/null -w "%{http_code}" http://localhost:5173/ || true)"
  fi

  if [[ "$back_code" =~ ^(2|3) ]]; then
    backend_ok=1
  fi
  if [[ "$front_code" =~ ^(2|3) ]]; then
    frontend_ok=1
  fi

  if [[ "$backend_ok" -eq 1 && "$frontend_ok" -eq 1 ]]; then
    echo "OK: backend ${back_code}, frontend ${front_code}"
    if command -v open >/dev/null 2>&1; then
      open "http://localhost:5173/" >/dev/null 2>&1 || true
      open "http://127.0.0.1:8000/docs" >/dev/null 2>&1 || true
    fi
    exit 0
  fi

  echo "  still waiting (backend ${back_code:-000}, frontend ${front_code:-000})..."
  sleep 1
done

echo "FAILED: backend ${back_code}, frontend ${front_code}"
echo "See logs: ${LOG_FILE}"
exit 1
