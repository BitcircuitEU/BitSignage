#!/usr/bin/env bash
set -euo pipefail

APP_URL="http://localhost:3000/display.html"
export APP_URL

export HOME="/home/wag"
export XDG_RUNTIME_DIR="/tmp/xdg-runtime-wag"
mkdir -p "${XDG_RUNTIME_DIR}"
chmod 700 "${XDG_RUNTIME_DIR}"
chown wag:wag "${XDG_RUNTIME_DIR}"

XAUTHORITY="${XAUTHORITY:-/home/wag/.Xauthority}"
export XAUTHORITY
if [[ ! -f "${XAUTHORITY}" ]]; then
  touch "${XAUTHORITY}"
  chown wag:wag "${XAUTHORITY}"
fi

log() {
  echo "[kiosk-launch] $1"
}

log "Starte X-Server und Chromium-Kiosk"
exec /usr/bin/xinit /home/wag/signage/scripts/kiosk-session.sh -- :0 -nolisten tcp vt1
