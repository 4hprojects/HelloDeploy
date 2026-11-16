#!/usr/bin/env bash
# Install the daily off-host backup timer (backup-offsite.sh).
#
# Prerequisites (see docs/OPERATIONS_RUNBOOKS.md › Scheduled off-host backups):
#   - rclone installed, with a `crypt` remote configured for root (`sudo rclone config`)
#
# Usage (idempotent):
#   sudo bash infrastructure/install-backup.sh --remote hdbackup:hellodeploy [--retention-days 14]
set -euo pipefail

CONFIG_DIR="/etc/hellodeploy"
CONFIG_FILE="$CONFIG_DIR/backup.conf"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REMOTE=""
RETENTION_DAYS=14

info()  { echo "[info]  $*"; }
error() { echo "[error] $*" >&2; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --remote) REMOTE="${2:-}"; shift 2 ;;
    --retention-days) RETENTION_DAYS="${2:-}"; shift 2 ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root.  Try: sudo bash $0"
  exit 1
fi
if [[ -z "$REMOTE" ]]; then
  error "--remote is required, for example --remote hdbackup:hellodeploy"
  exit 1
fi
if ! command -v rclone >/dev/null 2>&1; then
  error "rclone is not installed. Install it with: sudo apt install rclone"
  exit 1
fi
if [[ ! -d "$CONFIG_DIR" ]]; then
  error "$CONFIG_DIR is missing. Install HelloDeploy first."
  exit 1
fi

(umask 077 && printf 'BACKUP_RCLONE_REMOTE=%s\nBACKUP_RETENTION_DAYS=%s\n' "$REMOTE" "$RETENTION_DAYS" > "$CONFIG_FILE")
chown root:root "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"
info "Wrote $CONFIG_FILE."

install -m 0644 "$SCRIPT_DIR/systemd/hellodeploy-backup.service" /etc/systemd/system/
install -m 0644 "$SCRIPT_DIR/systemd/hellodeploy-backup.timer" /etc/systemd/system/
systemctl daemon-reload

# The first run proves the remote, encryption and permissions before the timer is trusted.
info "Running the first backup now…"
if ! systemctl start hellodeploy-backup.service; then
  error "The first backup failed; the timer is not enabled. See: journalctl -u hellodeploy-backup"
  exit 1
fi
systemctl enable --now hellodeploy-backup.timer

echo ""
echo "Daily off-host backup enabled."
echo "  Uploads:  sudo rclone lsl $REMOTE"
echo "  Last run: journalctl -u hellodeploy-backup -n 20"
echo "  Next run: systemctl list-timers hellodeploy-backup.timer"
