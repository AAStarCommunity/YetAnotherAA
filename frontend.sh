#!/usr/bin/env bash
# Start or restart the Next.js frontend (port 5173)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/aastar-frontend"
PID_FILE="/tmp/yaaa-frontend.pid"

stop_frontend() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Stopping frontend (PID $PID)..."
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  # Kill whatever is LISTENING on 5173 (the next dev child can outlive its parent),
  # scoped to LISTEN, then WAIT until the port is free before the caller restarts —
  # otherwise the new dev server can't bind 5173.
  lsof -ti:5173 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
  for _ in $(seq 1 20); do
    lsof -ti:5173 -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.5
  done
}

case "${1:-start}" in
  stop)
    stop_frontend
    echo "Frontend stopped."
    ;;
  restart|start)
    stop_frontend
    cd "$FRONTEND_DIR"
    echo "Starting frontend (Next.js, port 5173)..."
    npm run dev &
    echo $! > "$PID_FILE"
    echo "Frontend started (PID $(cat $PID_FILE)). Open http://localhost:5173"
    ;;
  *)
    echo "Usage: $0 [start|stop|restart]"
    exit 1
    ;;
esac
