#!/usr/bin/env bash
# HelloDeploy restore script.
#
# Restores a backup created by backup.sh.  Tested on a clean Ubuntu 22.04/24.04
# machine with HelloDeploy already installed (via install.sh).
#
# Usage:
#   sudo bash infrastructure/restore.sh /var/backups/hellodeploy/20240601_120000
set -euo pipefail

HD_USER="hellodeploy"
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

if [[ -f "$BACKUP_DIR/MANIFEST.txt" ]]; then
  echo "Backup manifest:"
  cat "$BACKUP_DIR/MANIFEST.txt"
  echo ""
fi

read -rp "Continue? [y/N] > " CONFIRM
if [[ "${CONFIRM:-}" != "y" && "${CONFIRM:-}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# ─── stop services ───────────────────────────────────────────────────────────

section "Stopping services"
sudo -u "$HD_USER" pm2 stop ecosystem.config.cjs 2>/dev/null || warn "PM2 stop failed — services may not have been running"
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
  chown "$HD_USER:$HD_USER" "$HD_HOME/.env"
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
  chown -R "$HD_USER:$HD_USER" "$HD_DATA"
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
    mongorestore --uri="$MONGO_URI" --drop "$TEMP_DIR/mongodump" --quiet || \
      warn "mongorestore failed — manual restore may be needed"
    rm -rf "$TEMP_DIR"
    info "MongoDB restored"
  fi
else
  warn "mongodb-dump.tar.gz not found or mongorestore not available."
  warn "Restore MongoDB Atlas via the Atlas console: Backup → Restore"
fi

# ─── restart services ────────────────────────────────────────────────────────

section "Restarting services"
sudo -u "$HD_USER" pm2 start ecosystem.config.cjs
info "Services started."

sleep 3
sudo -u "$HD_USER" pm2 status

echo ""
echo -e "${GREEN}${BOLD}Restore complete.${NC}"
echo "  Review pm2 logs for any startup errors: pm2 logs"
echo ""
