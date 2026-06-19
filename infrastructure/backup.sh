#!/usr/bin/env bash
# HelloDeploy backup script.
#
# Creates a compressed archive of:
#   - .env (config and secrets)
#   - /var/lib/hellodeploy (build/release/project data)
#   - MongoDB dump (if mongodump is available)
#
# Usage:
#   sudo bash infrastructure/backup.sh
#   sudo bash infrastructure/backup.sh --output /path/to/dir
#   sudo bash infrastructure/backup.sh --quiet    # suppress progress output
set -euo pipefail

HD_HOME="/opt/hellodeploy"
HD_DATA="/var/lib/hellodeploy"
BACKUP_ROOT="/var/backups/hellodeploy"
QUIET=false
OUTPUT_DIR=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { $QUIET || echo -e "${GREEN}[info]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --output) OUTPUT_DIR="$2"; shift 2 ;;
    --quiet)  QUIET=true; shift ;;
    *) shift ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root.  Try: sudo bash $0"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
WORK_DIR="${OUTPUT_DIR:-$BACKUP_ROOT/$TIMESTAMP}"
mkdir -p "$WORK_DIR"

info "Backup destination: $WORK_DIR"

# ─── .env ────────────────────────────────────────────────────────────────────

if [[ -f "$HD_HOME/.env" ]]; then
  cp "$HD_HOME/.env" "$WORK_DIR/env.backup"
  chmod 600 "$WORK_DIR/env.backup"
  info "Copied .env"
else
  warn ".env not found at $HD_HOME/.env — skipping"
fi

# ─── data directory ───────────────────────────────────────────────────────────

if [[ -d "$HD_DATA" ]]; then
  info "Archiving $HD_DATA…"
  tar -czf "$WORK_DIR/hellodeploy-data.tar.gz" -C "$(dirname "$HD_DATA")" "$(basename "$HD_DATA")"
  info "Archived $(du -sh "$WORK_DIR/hellodeploy-data.tar.gz" | cut -f1)"
else
  warn "$HD_DATA not found — skipping data archive"
fi

# ─── MongoDB dump ─────────────────────────────────────────────────────────────

if command -v mongodump &>/dev/null && [[ -f "$HD_HOME/.env" ]]; then
  MONGO_URI=$(grep ^MONGODB_URI "$HD_HOME/.env" | cut -d= -f2- | tr -d '"')
  if [[ -n "$MONGO_URI" ]]; then
    info "Running mongodump…"
    mongodump --uri="$MONGO_URI" --out="$WORK_DIR/mongodump" --quiet 2>/dev/null || \
      warn "mongodump failed — manual MongoDB backup may be needed"
    if [[ -d "$WORK_DIR/mongodump" ]]; then
      tar -czf "$WORK_DIR/mongodb-dump.tar.gz" -C "$WORK_DIR" mongodump
      rm -rf "$WORK_DIR/mongodump"
      info "MongoDB dump archived"
    fi
  fi
else
  warn "mongodump not found or .env missing — skipping MongoDB backup"
  warn "Back up MongoDB Atlas via the Atlas console: Backup → Take Snapshot"
fi

# ─── manifest ────────────────────────────────────────────────────────────────

cat > "$WORK_DIR/MANIFEST.txt" <<EOF
HelloDeploy Backup
Created:  $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Hostname: $(hostname)
Commit:   $(git -C "$HD_HOME" rev-parse --short HEAD 2>/dev/null || echo "unknown")

Files:
$(ls -1 "$WORK_DIR")
EOF

# ─── done ────────────────────────────────────────────────────────────────────

$QUIET || echo ""
info "Backup complete: $WORK_DIR"
$QUIET || echo ""
$QUIET || echo "To restore this backup:"
$QUIET || echo "  sudo bash infrastructure/restore.sh $WORK_DIR"
$QUIET || echo ""
