#!/usr/bin/env bash
# HelloDeploy uninstaller.
#
# Stops services and removes HelloDeploy from the server.
# System packages (Node, Nginx, Redis, Docker) are NOT removed since they
# may be shared with other applications.
#
# Usage:
#   sudo bash infrastructure/uninstall.sh
#   sudo bash infrastructure/uninstall.sh --purge-data   # also remove /var/lib/hellodeploy
set -euo pipefail

HD_WEB_USER="hellodeploy-web"
HD_WORKER_USER="hellodeploy-worker"
HD_HOME="/opt/hellodeploy"
HD_DATA="/var/lib/hellodeploy"
HD_LOG="/var/log/hellodeploy"
PURGE_DATA=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[info]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --purge-data) PURGE_DATA=true; shift ;;
    *) shift ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root."
  exit 1
fi

echo ""
echo -e "${RED}${BOLD}HelloDeploy Uninstaller${NC}"
echo "─────────────────────────────────────────────"
echo "  This will remove the HelloDeploy application."
if $PURGE_DATA; then
  echo -e "  ${RED}--purge-data specified: /var/lib/hellodeploy will also be removed.${NC}"
fi
echo ""
echo "  System packages (Node.js, Nginx, Redis, Docker) are NOT removed."
echo ""
read -rp "Are you sure? Type 'yes' to confirm > " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

# ─── create final backup ─────────────────────────────────────────────────────

echo ""
warn "Creating a final backup before removal…"
bash "$(dirname "$0")/backup.sh" --output "/var/backups/hellodeploy/pre-uninstall-$(date +%Y%m%d_%H%M%S)" || \
  warn "Backup failed — continuing uninstall anyway"

# ─── stop and remove systemd services ────────────────────────────────────────

info "Stopping systemd services…"
systemctl disable --now hellodeploy-worker hellodeploy-web hellodeploy-nginx-helper 2>/dev/null || true
rm -f /etc/systemd/system/hellodeploy-worker.service \
      /etc/systemd/system/hellodeploy-web.service \
      /etc/systemd/system/hellodeploy-nginx-helper.service
systemctl daemon-reload

# ─── remove Nginx config ─────────────────────────────────────────────────────

info "Removing Nginx hellodeploy routes…"
if [[ -d /etc/nginx/hellodeploy.d ]]; then
  rm -f /etc/nginx/hellodeploy.d/*.conf
  info "Cleared /etc/nginx/hellodeploy.d"
fi
if [[ -f /etc/nginx/conf.d/hellodeploy.conf ]]; then
  rm -f /etc/nginx/conf.d/hellodeploy.conf
  info "Removed /etc/nginx/conf.d/hellodeploy.conf"
fi
if [[ -f /etc/nginx/conf.d/hellodeploy-platform.conf ]]; then
  rm -f /etc/nginx/conf.d/hellodeploy-platform.conf
  info "Removed /etc/nginx/conf.d/hellodeploy-platform.conf"
fi
nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || warn "Nginx reload failed — check config manually"

# ─── stop and remove containers ──────────────────────────────────────────────

info "Removing HelloDeploy Docker containers…"
docker ps -a --filter "name=hellodeploy-" --format "{{.ID}}" | xargs -r docker rm -f || true
docker network ls --filter "name=hellodeploy-" --format "{{.ID}}" | xargs -r docker network rm || true

# ─── remove application ──────────────────────────────────────────────────────

info "Removing application at $HD_HOME…"
rm -rf "$HD_HOME"

# ─── remove logs ─────────────────────────────────────────────────────────────

info "Removing logs at $HD_LOG…"
rm -rf "$HD_LOG"

# ─── optionally remove data ───────────────────────────────────────────────────

if $PURGE_DATA; then
  info "Removing data directory $HD_DATA…"
  rm -rf "${HD_DATA:?}"
else
  info "Data directory $HD_DATA preserved.  Use --purge-data to remove it."
fi

# ─── remove system user ───────────────────────────────────────────────────────

info "Removing HelloDeploy system users and groups…"
userdel "$HD_WEB_USER" 2>/dev/null || true
userdel "$HD_WORKER_USER" 2>/dev/null || true
groupdel hellodeploy-config 2>/dev/null || true
groupdel hellodeploy-nginx 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}HelloDeploy has been removed.${NC}"
echo "  Backup saved at: /var/backups/hellodeploy/pre-uninstall-*"
echo ""
