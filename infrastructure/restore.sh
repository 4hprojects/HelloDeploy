#!/usr/bin/env bash
# HelloDeploy restore script.
#
# Restores a backup created by backup.sh.  Tested on a clean Ubuntu 22.04/24.04
# machine with HelloDeploy already installed (via install.sh).
#
# Usage:
#   sudo bash infrastructure/restore.sh /var/backups/hellodeploy/20240601_120000
set -euo pipefail

HD_WEB_USER="hellodeploy-web"
HD_WORKER_USER="hellodeploy-worker"
HD_CONFIG_GROUP="hellodeploy-config"
HD_HOME="/opt/hellodeploy"
HD_DATA="/var/lib/hellodeploy"

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
  error "This script must be run as root.  Try: sudo bash $0 <backup-dir>"
  exit 1
fi

BACKUP_DIR="${1:-}"
if [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  error "Usage: sudo bash $0 <backup-directory>"
  error "Example: sudo bash $0 /var/backups/hellodeploy/20240601_120000"
  exit 1
fi

echo ""
echo -e "${BOLD}HelloDeploy Restore${NC}"
echo "─────────────────────────────"
echo "  Backup:      $BACKUP_DIR"
echo "  Destination: $HD_HOME"
echo ""

if [[ ! -f "$BACKUP_DIR/manifest.json" || ! -f "$BACKUP_DIR/CHECKSUMS.sha256" ]]; then
  error "Backup is missing manifest.json or CHECKSUMS.sha256. Refusing to restore."
  exit 1
fi

if ! (cd "$BACKUP_DIR" && sha256sum --check --strict CHECKSUMS.sha256); then
  error "Backup integrity verification failed. Refusing to restore."
  exit 1
fi
info "Backup checksums verified."

if [[ -f "$BACKUP_DIR/manifest.json" ]]; then
  echo "Backup manifest:"
  cat "$BACKUP_DIR/manifest.json"
  echo ""
fi

read -rp "Continue? [y/N] > " CONFIRM
if [[ "${CONFIRM:-}" != "y" && "${CONFIRM:-}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# ─── stop services ───────────────────────────────────────────────────────────

section "Stopping services"
systemctl stop hellodeploy-worker hellodeploy-web hellodeploy-nginx-helper 2>/dev/null || warn "Service stop failed — services may not have been running"
info "Services stopped."

# ─── restore .env ────────────────────────────────────────────────────────────

section "Restoring configuration"
if [[ -f "$BACKUP_DIR/env.backup" ]]; then
  if [[ -f "$HD_HOME/.env" ]]; then
    cp "$HD_HOME/.env" "$HD_HOME/.env.pre-restore-$(date +%s)"
    warn "Existing .env backed up as .env.pre-restore-*"
  fi
  cp "$BACKUP_DIR/env.backup" "$HD_HOME/.env"
  chmod 600 "$HD_HOME/.env"
  chown root:"$HD_CONFIG_GROUP" "$HD_HOME/.env"
  info "Restored .env"
else
  warn "env.backup not found in backup — keeping existing .env"
fi

# ─── restore data ────────────────────────────────────────────────────────────

section "Restoring data"
if [[ -f "$BACKUP_DIR/hellodeploy-data.tar.gz" ]]; then
  # Remove existing data directory first to prevent stale files
  if [[ -d "$HD_DATA" ]]; then
    rm -rf "${HD_DATA:?}"
    info "Removed existing $HD_DATA"
  fi
  tar -xzf "$BACKUP_DIR/hellodeploy-data.tar.gz" -C "$(dirname "$HD_DATA")"
  chown -R "$HD_WORKER_USER:$HD_CONFIG_GROUP" "$HD_DATA"
  info "Restored $HD_DATA"
else
  warn "hellodeploy-data.tar.gz not found in backup — skipping data restore"
fi

# ─── restore MongoDB ─────────────────────────────────────────────────────────

section "MongoDB"
if [[ -f "$BACKUP_DIR/mongodb-dump.tar.gz" ]] && command -v mongorestore &>/dev/null; then
  MONGO_URI=$(grep ^MONGODB_URI "$HD_HOME/.env" | cut -d= -f2- | tr -d '"')
  if [[ -n "$MONGO_URI" ]]; then
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$BACKUP_DIR/mongodb-dump.tar.gz" -C "$TEMP_DIR"
    if ! mongorestore --uri="$MONGO_URI" --drop "$TEMP_DIR/mongodump" --quiet; then
      error "mongorestore failed; services will remain stopped"
      rm -rf "$TEMP_DIR"
      exit 1
    fi
    rm -rf "$TEMP_DIR"
    info "MongoDB restored"
  fi
else
  warn "mongodb-dump.tar.gz not found or mongorestore not available."
  warn "Restore MongoDB Atlas via the Atlas console: Backup → Restore"
fi

# ─── restore routing state ───────────────────────────────────────────────────

section "Routing state"
if [[ -f "$BACKUP_DIR/nginx-routes.tar.gz" ]]; then
  rm -rf /etc/nginx/hellodeploy.d
  tar -xzf "$BACKUP_DIR/nginx-routes.tar.gz" -C /etc/nginx
  chown -R root:root /etc/nginx/hellodeploy.d
  info "Restored generated Nginx routes"
fi
if [[ -f "$BACKUP_DIR/hellodeploy-platform.conf" ]]; then
  install -m 0644 "$BACKUP_DIR/hellodeploy-platform.conf" /etc/nginx/conf.d/hellodeploy-platform.conf
  info "Restored platform ingress"
fi
nginx -t

# ─── restart services ────────────────────────────────────────────────────────

section "Restarting services"
systemctl start hellodeploy-nginx-helper hellodeploy-web hellodeploy-worker
info "Services started."

sleep 3
systemctl --no-pager status hellodeploy-nginx-helper hellodeploy-web hellodeploy-worker

echo ""
echo -e "${GREEN}${BOLD}Restore complete.${NC}"
echo "  Review service logs: journalctl -u 'hellodeploy-*'"
echo ""
