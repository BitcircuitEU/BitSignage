#!/usr/bin/env bash
set -euo pipefail

PI_USER="wag"
APP_DIR="/home/${PI_USER}/signage"
SERVICES=("signage.service" "signage-kiosk.service")

log() {
  echo "[install] $1"
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Dieses Skript muss als root ausgeführt werden." >&2
    exit 1
  fi
}

run_as_pi() {
  local COMMAND="$1"
  su - "${PI_USER}" -c "${COMMAND}"
}

install_packages() {
  local packages=(
    curl
    git
    cec-utils
    chromium
    xserver-xorg
    xinit
    openbox
    x11-xserver-utils
    unclutter
    rclone
    fuse3
    nodejs
    npm
  )
  log "Installiere benötigte Debian-Pakete"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends "${packages[@]}"
}

install_node_dependencies() {
  log "Installiere npm-Abhängigkeiten im Projekt"
  run_as_pi "cd '${APP_DIR}' && npm install"
}

deploy_services() {
  for service in "${SERVICES[@]}"; do
    if [[ ! -f "${APP_DIR}/${service}" ]]; then
      echo "Service-Datei ${service} fehlt im Repository" >&2
      exit 1
    fi
    log "Kopiere ${service} nach /etc/systemd/system/"
    install -m 644 "${APP_DIR}/${service}" "/etc/systemd/system/${service}"
  done

  log "systemd neu laden & Services aktivieren"
  systemctl daemon-reload
  systemctl enable --now signage.service
  systemctl enable --now signage-kiosk.service
}

ensure_permissions() {
  log "Setze Ausführbarkeiten für Skripte"
  chmod +x "${APP_DIR}/scripts/"*.sh
  chown -R "${PI_USER}:${PI_USER}" "${APP_DIR}"
}

main() {
  require_root
  install_packages
  install_node_dependencies
  ensure_permissions
  deploy_services
  log "Installation abgeschlossen. Display sollte nun das Signage anzeigen."
}

main "$@"

