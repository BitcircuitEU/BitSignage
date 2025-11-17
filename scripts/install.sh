#!/usr/bin/env bash
set -euo pipefail

PI_USER="wag"
APP_DIR="/home/${PI_USER}/signage"
NVM_DIR="/home/${PI_USER}/.nvm"
NODE_VERSION="20"
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
    fuse
  )
  log "Installiere benötigte Debian-Pakete"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends "${packages[@]}"
}

setup_nvm_node() {
  if [[ ! -d "${NVM_DIR}" ]]; then
    log "Installiere NVM für Benutzer ${PI_USER}"
    run_as_pi "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
  else
    log "NVM bereits vorhanden – überspringe Installation"
  fi

  local nvm_cmd="export NVM_DIR='${NVM_DIR}' && \
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && \
    nvm install ${NODE_VERSION} && \
    nvm alias default ${NODE_VERSION} && \
    nvm use ${NODE_VERSION}"

  log "Installiere Node.js ${NODE_VERSION} via NVM (User ${PI_USER})"
  run_as_pi "${nvm_cmd}"
}

install_node_dependencies() {
  local nvm_env="export NVM_DIR='${NVM_DIR}' && \
    [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && \
    nvm use ${NODE_VERSION} >/dev/null"

  log "Installiere npm-Abhängigkeiten im Projekt"
  run_as_pi "cd '${APP_DIR}' && ${nvm_env} && npm install"
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
  setup_nvm_node
  install_node_dependencies
  ensure_permissions
  deploy_services
  log "Installation abgeschlossen. Display sollte nun das Signage anzeigen."
}

main "$@"

