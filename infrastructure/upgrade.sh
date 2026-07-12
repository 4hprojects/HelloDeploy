#!/usr/bin/env bash
# HelloDeploy upgrade script.
#
# Checks out an immutable release, installs dependencies, and restarts services.
# A backup is created before any changes are made.
#
# Usage:
#   sudo bash infrastructure/upgrade.sh --ref v1.2.0
#   HELLODEPLOY_RELEASE_REF=<full-commit-sha> sudo bash infrastructure/upgrade.sh
set -euo pipefail

HD_HOME="/opt/hellodeploy"
BACKUP_ROOT="/var/backups/hellodeploy"
RELEASE_REF="${HELLODEPLOY_RELEASE_REF:-}"

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
    --ref) RELEASE_REF="${2:-}"; shift 2 ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$RELEASE_REF" ]]; then
  error "An immutable release tag or full commit SHA is required."
  error "Usage: sudo bash $0 --ref v1.2.3"
  exit 1
fi

cd "$HD_HOME"
if [[ -n "$(git status --porcelain)" ]]; then
  error "Refusing to upgrade a dirty production checkout. Review or remove local changes first."
  exit 1
fi

PREV_COMMIT=$(git rev-parse --verify HEAD)
info "Current commit: $PREV_COMMIT"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_ROOT/$TIMESTAMP"

# ─── pre-upgrade backup ───────────────────────────────────────────────────────

section "Pre-upgrade backup"
mkdir -p "$BACKUP_PATH"
BACKUP_ARGS=(--output "$BACKUP_PATH" --quiet)
if [[ "${HELLODEPLOY_DATABASE_BACKUP_MODE:-local}" == "external" ]]; then
  BACKUP_ARGS+=(--skip-database)
fi
bash "$(dirname "$0")/backup.sh" "${BACKUP_ARGS[@]}"
info "Backup saved to $BACKUP_PATH"

# ─── resolve immutable release ───────────────────────────────────────────────

section "Pulling code"
git fetch --tags origin
NEW_COMMIT=$(git rev-parse --verify "${RELEASE_REF}^{commit}")
git checkout --detach "$NEW_COMMIT"
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

# ─── readiness and installation checks ──────────────────────────────────────

section "Readiness check"
sleep 3
if ! systemctl is-active --quiet hellodeploy-nginx-helper hellodeploy-web hellodeploy-worker || \
   ! curl --fail --silent --show-error "http://127.0.0.1:$(awk -F= '$1 == "PORT" {print $2}' .env)/ready" >/dev/null || \
   ! bash infrastructure/verify-installation.sh; then
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
