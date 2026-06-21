#!/usr/bin/env bash
# Start or restart the NestJS backend (port 3000)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/aastar"
PID_FILE="/tmp/yaaa-backend.pid"

stop_backend() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Stopping backend (PID $PID)..."
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  # Kill whatever is LISTENING on 3000 (the nest --watch child often outlives its
  # parent and keeps the port). Scope to LISTEN so we don't kill clients (e.g. the
  # frontend proxying to 3000), then WAIT until the port is actually free before the
  # caller starts a new server — otherwise start hits EADDRINUSE.
  lsof -ti:3000 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
  for _ in $(seq 1 20); do
    lsof -ti:3000 -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.5
  done
}

case "${1:-start}" in
  stop)
    stop_backend
    echo "Backend stopped."
    ;;
  restart|start)
    stop_backend
    cd "$BACKEND_DIR"
    echo "Starting backend (NestJS, port 3000)..."
    npm run start:dev &
    echo $! > "$PID_FILE"
    echo "Backend started (PID $(cat $PID_FILE)). Logs piped to terminal."
    ;;
  *)
    echo "Usage: $0 [start|stop|restart]"
    exit 1
    ;;
esac
