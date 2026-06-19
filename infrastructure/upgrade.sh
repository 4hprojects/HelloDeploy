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

HD_USER="hellodeploy"
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
PREV_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "Current commit: $PREV_COMMIT"

# ─── pull latest ─────────────────────────────────────────────────────────────

section "Pulling code"
sudo -u "$HD_USER" git fetch --tags origin

if [[ -n "$BRANCH" ]]; then
  sudo -u "$HD_USER" git checkout "$BRANCH"
  sudo -u "$HD_USER" git pull origin "$BRANCH" || true
else
  sudo -u "$HD_USER" git pull
fi

NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "Updated to commit: $NEW_COMMIT"

if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
  warn "Already up to date ($NEW_COMMIT).  Continuing to reinstall dependencies and restart."
fi

# ─── dependencies ────────────────────────────────────────────────────────────

section "Dependencies"
sudo -u "$HD_USER" npm install --omit=dev

# ─── restart services ────────────────────────────────────────────────────────

section "Restarting services"
sudo -u "$HD_USER" pm2 reload ecosystem.config.cjs --update-env
info "Services reloaded."

# ─── health check ────────────────────────────────────────────────────────────

section "Health check"
sleep 3
PM2_STATUS=$(sudo -u "$HD_USER" pm2 jlist 2>/dev/null | node -e "
  const list = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const hd = list.filter(p => p.name.startsWith('hellodeploy-'));
  const bad = hd.filter(p => p.pm2_env.status !== 'online');
  if (bad.length) {
    bad.forEach(p => process.stderr.write(p.name + ': ' + p.pm2_env.status + '\n'));
    process.exit(1);
  }
  process.stdout.write('all online\n');
" 2>&1 || echo "status-check-failed")

if [[ "$PM2_STATUS" != "all online" ]]; then
  error "One or more services are not online after upgrade."
  error "Rolling back to $PREV_COMMIT…"
  sudo -u "$HD_USER" git checkout "$PREV_COMMIT"
  sudo -u "$HD_USER" npm install --omit=dev
  sudo -u "$HD_USER" pm2 reload ecosystem.config.cjs --update-env
  error "Rollback complete.  Investigate the logs: pm2 logs"
  exit 1
fi

echo ""
echo -e "${GREEN}${BOLD}Upgrade complete!${NC}"
echo "  Previous commit: $PREV_COMMIT"
echo "  Current commit:  $NEW_COMMIT"
echo "  Backup at:       $BACKUP_PATH"
echo ""
