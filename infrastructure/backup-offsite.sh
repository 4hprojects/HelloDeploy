#!/usr/bin/env bash
# Scheduled off-host backup (run daily by hellodeploy-backup.timer).
#
# Runs backup.sh, adds the host configuration it leaves out (/etc/hellodeploy,
# /etc/cloudflared), uploads one archive through an rclone `crypt` remote, then
# prunes uploads and local backup directories older than the retention period.
#
# The archive holds .env and a database dump, so it is only ever uploaded
# through a crypt remote: rclone encrypts it before it leaves the host.
#
# Configuration: /etc/hellodeploy/backup.conf (root-owned, 0600)
#   BACKUP_RCLONE_REMOTE=hdbackup:hellodeploy   # crypt remote name and folder
#   BACKUP_RETENTION_DAYS=14
#
# Usage:
#   sudo bash infrastructure/backup-offsite.sh
set -euo pipefail

CONFIG_FILE="/etc/hellodeploy/backup.conf"
BACKUP_ROOT="/var/backups/hellodeploy"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

info()  { echo "[info]  $*"; }
error() { echo "[error] $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root.  Try: sudo bash $0"
  exit 1
fi
if ! command -v rclone >/dev/null 2>&1; then
  error "rclone is not installed. Install it with: sudo apt install rclone"
  exit 1
fi
if [[ ! -f "$CONFIG_FILE" ]]; then
  error "$CONFIG_FILE is missing. Run infrastructure/install-backup.sh first."
  exit 1
fi
if [[ "$(stat -c '%U %a' "$CONFIG_FILE")" != "root 600" ]]; then
  error "$CONFIG_FILE must be owned by root with mode 0600."
  exit 1
fi

# Parsed, not sourced, so the file can never run code as root.
read_setting() {
  sed -n "s/^$1=//p" "$CONFIG_FILE" | tail -n 1 | tr -d '"'"'"
}
REMOTE=$(read_setting BACKUP_RCLONE_REMOTE)
RETENTION_DAYS=$(read_setting BACKUP_RETENTION_DAYS)
RETENTION_DAYS=${RETENTION_DAYS:-14}

if [[ ! "$REMOTE" =~ ^[A-Za-z0-9_-]+:[A-Za-z0-9_./-]*$ ]]; then
  error "BACKUP_RCLONE_REMOTE must look like name:folder, for example hdbackup:hellodeploy."
  exit 1
fi
if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  error "BACKUP_RETENTION_DAYS must be a whole number of days, at least 1."
  exit 1
fi
remote_name="${REMOTE%%:*}"
remote_type=$(rclone listremotes --long | awk -v name="$remote_name:" '$1 == name {print $2}')
if [[ "$remote_type" != "crypt" ]]; then
  error "rclone remote '$remote_name' is type '${remote_type:-missing}', not crypt."
  error "Refusing to upload an unencrypted backup."
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
STAGE=$(mktemp -d "$BACKUP_ROOT/.offsite.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARTIFACT="hellodeploy-$(hostname -s)-$STAMP.tar"

info "Creating backup…"
bash "$SCRIPT_DIR/backup.sh" --quiet --output "$STAGE/backup"

host_config=()
for dir in hellodeploy cloudflared; do
  [[ -d "/etc/$dir" ]] && host_config+=("$dir")
done
tar -czf "$STAGE/host-config.tar.gz" -C /etc "${host_config[@]}"
tar -cf "$STAGE/$ARTIFACT" -C "$STAGE" backup host-config.tar.gz

info "Uploading $ARTIFACT ($(du -h "$STAGE/$ARTIFACT" | cut -f1)) to $REMOTE…"
rclone copyto "$STAGE/$ARTIFACT" "$REMOTE/$ARTIFACT"

# Only reached after a successful upload, so pruning never removes the last good copy.
info "Removing uploads and local backups older than $RETENTION_DAYS days…"
rclone delete "$REMOTE" --min-age "${RETENTION_DAYS}d" --include 'hellodeploy-*.tar'
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9][0-9][0-9][0-9][0-9]_[0-9]*' \
  -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

info "Off-host backup complete: $REMOTE/$ARTIFACT"
