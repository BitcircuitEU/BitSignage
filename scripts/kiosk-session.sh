#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000/display.html}"
TARGET_USER="${KIOSK_USER:-wag}"

if [[ "${KIOSK_AS_USER:-0}" != "1" ]]; then
  SUDO_BIN="$(command -v sudo || true)"
  if [[ -z "${SUDO_BIN}" ]]; then
    echo "[kiosk-x] sudo nicht gefunden" >&2
    exit 1
  fi
  exec "${SUDO_BIN}" -u "${TARGET_USER}" env DISPLAY="${DISPLAY}" XAUTHORITY="${XAUTHORITY}" XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR}" HOME="/home/${TARGET_USER}" KIOSK_AS_USER=1 APP_URL="${APP_URL}" /home/wag/signage/scripts/kiosk-session.sh
fi

log() {
  echo "[kiosk-x] $1"
}

log "X-Session gestartet für ${APP_URL}"

if command -v xset >/dev/null 2>&1; then
  xset -dpms || true
  xset s off || true
  xset s noblank || true
fi

if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0 -root &
fi

OPENBOX_BIN=$(command -v openbox-session || true)
if [[ -n "$OPENBOX_BIN" ]]; then
  "$OPENBOX_BIN" &
  OPENBOX_PID=$!
else
  OPENBOX_PID=""
fi

CHROMIUM_BIN=$(command -v chromium-browser || command -v chromium || true)
if [[ -z "$CHROMIUM_BIN" ]]; then
  log "Chromium nicht gefunden"
  exit 1
fi

log "Starte Chromium im Kiosk-Modus"
"$CHROMIUM_BIN" \
  --no-memcheck \
  --kiosk "$APP_URL" \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  --incognito \
  --autoplay-policy=no-user-gesture-required \
  --simulate-outdated-no-au='Tue, 31 Dec 2099 23:59:59 GMT'
STATUS=$?

if [[ -n "${OPENBOX_PID}" ]]; then
  kill "$OPENBOX_PID" 2>/dev/null || true
fi

log "Chromium beendet mit Status ${STATUS}"
exit ${STATUS}
