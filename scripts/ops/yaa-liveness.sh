#!/usr/bin/env bash
# YAA liveness monitor — checks the cos72 stack (frontend/backend/tunnel) + KMS and alerts
# on STATE CHANGE (up→down / down→up) via Telegram, so a beta running on one laptop +
# launchd isn't silently down. Run periodically via launchd (io.aastar.yaa-monitor.plist).
#
# Telegram creds are read from aastar/.env at runtime (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)
# — never hardcoded/committed. If absent, it logs only. Alerts fire only on transitions
# (state files) so a persistent outage doesn't spam every interval.
set -uo pipefail

REPO="${YAA_REPO:-/Users/jason/Dev/aastar/YetAnotherAA}"
ENV_FILE="$REPO/aastar/.env"
STATE_DIR="${YAA_MONITOR_STATE:-$HOME/.yaa-monitor}"
LOG="${YAA_MONITOR_LOG:-$HOME/Library/Logs/yaa-monitor.log}"
mkdir -p "$STATE_DIR" "$(dirname "$LOG")"

BOT="" CHAT=""
if [ -f "$ENV_FILE" ]; then
  BOT=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d "\"' \r")
  CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d "\"' \r")
fi

ts() { date "+%Y-%m-%d %H:%M:%S"; }

alert() { # $1 = message
  echo "$(ts) ALERT: $1" >>"$LOG"
  if [ -n "$BOT" ] && [ -n "$CHAT" ]; then
    curl -s --max-time 10 "https://api.telegram.org/bot${BOT}/sendMessage" \
      --data-urlencode "chat_id=${CHAT}" \
      --data-urlencode "text=🖥️ YAA monitor: $1" >/dev/null 2>&1 || true
  fi
}

check() { # $1 name, $2 url
  local name="$1" url="$2" code now prev sf
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$url" 2>/dev/null)
  now="ok"; [ "$code" = "200" ] || now="fail"
  sf="$STATE_DIR/${name}.state"
  prev=$(cat "$sf" 2>/dev/null || echo "unknown")
  echo "$(ts) ${name} -> ${code} (${now})" >>"$LOG"
  if [ "$now" != "$prev" ]; then
    if [ "$now" = "fail" ]; then
      alert "${name} DOWN (http=${code}) ${url}"
    elif [ "$prev" = "fail" ]; then
      alert "${name} recovered (http=${code})"
    fi
    echo "$now" >"$sf"
  fi
}

check "frontend-5173" "http://localhost:5173"
check "backend-health" "http://localhost:3000/api/v1/health"
check "cos72-external" "https://cos72.aastar.io"
check "kms-health" "https://kms.aastar.io/health"
