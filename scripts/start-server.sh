#!/usr/bin/env bash
set -euo pipefail
export NVM_DIR="/home/wag/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
cd /home/wag/signage
exec npm run start
