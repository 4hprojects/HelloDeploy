#!/usr/bin/env bash
# HelloDeploy upgrade script.
#
# Pulls the latest code, installs new dependencies, and restarts services.
# A backup is created before any changes are made.
#
# Usage:
#   sudo bash infrastructure/upgrade.sh
#   sudo bash infrastructure/upgrade.sh --branch v1.2.0   # specific branch/tag
set -euo pipefail

HD_HOME="/opt/hellodeploy"
BACKUP_ROOT="/var/backups/hellodeploy"
BRANCH="${HELLODEPLOY_BRANCH:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${GREEN}[info]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}── $* ──${NC}"; }

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root.  Try: sudo bash $0"
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --branch) BRANCH="$2"; shift 2 ;;
    *) shift ;;
  esac
done

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_ROOT/$TIMESTAMP"

# ─── pre-upgrade backup ───────────────────────────────────────────────────────

section "Pre-upgrade backup"
mkdir -p "$BACKUP_PATH"
bash "$(dirname "$0")/backup.sh" --output "$BACKUP_PATH" --quiet
info "Backup saved to $BACKUP_PATH"

# ─── record current state ────────────────────────────────────────────────────

cd "$HD_HOME"
PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
info "Current commit: $PREV_COMMIT"

# ─── pull latest ─────────────────────────────────────────────────────────────

section "Pulling code"
git fetch --tags origin

if [[ -n "$BRANCH" ]]; then
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  git pull --ff-only
fi

NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "Updated to commit: $NEW_COMMIT"

if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
  warn "Already up to date ($NEW_COMMIT).  Continuing to reinstall dependencies and restart."
fi

# ─── dependencies ────────────────────────────────────────────────────────────

section "Dependencies"
npm ci --omit=dev
sudo -u hellodeploy-web node scripts/validate-config.js --component web
sudo -u hellodeploy-worker node scripts/validate-config.js --component worker

# Refresh the platform ingress so proxy/security changes apply to existing installs.
bash infrastructure/nginx/render-platform-ingress.sh "$HD_HOME/.env"
info "Platform ingress refreshed."

# ─── restart services ────────────────────────────────────────────────────────

section "Restarting services"
install -m 0644 infrastructure/systemd/hellodeploy-web.service /etc/systemd/system/
install -m 0644 infrastructure/systemd/hellodeploy-worker.service /etc/systemd/system/
install -m 0644 infrastructure/systemd/hellodeploy-nginx-helper.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart hellodeploy-nginx-helper hellodeploy-web hellodeploy-worker
info "Services restarted."

# ─── health check ────────────────────────────────────────────────────────────

section "Health check"
sleep 3
if ! systemctl is-active --quiet hellodeploy-nginx-helper hellodeploy-web hellodeploy-worker || \
   ! curl --fail --silent --show-error "http://127.0.0.1:$(awk -F= '$1 == "PORT" {print $2}' .env)/health" >/dev/null; then
  error "One or more services are not online after upgrade."
  error "Rolling back to $PREV_COMMIT…"
  git checkout --detach "$PREV_COMMIT"
  npm ci --omit=dev
  systemctl restart hellodeploy-nginx-helper hellodeploy-web hellodeploy-worker
  error "Rollback complete. Investigate the logs: journalctl -u 'hellodeploy-*'"
  exit 1
fi

echo ""
echo -e "${GREEN}${BOLD}Upgrade complete!${NC}"
echo "  Previous commit: $PREV_COMMIT"
echo "  Current commit:  $NEW_COMMIT"
echo "  Backup at:       $BACKUP_PATH"
echo ""
