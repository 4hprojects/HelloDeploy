#!/usr/bin/env bash
# HelloDeploy backup script.
#
# Creates a compressed archive of:
#   - .env (config and secrets)
#   - /var/lib/hellodeploy (build/release/project data)
#   - MongoDB dump (unless explicitly managed externally)
#   - generated Nginx route and ingress state
#
# Usage:
#   sudo bash infrastructure/backup.sh
#   sudo bash infrastructure/backup.sh --output /path/to/dir
#   sudo bash infrastructure/backup.sh --skip-database # external snapshot verified separately
#   sudo bash infrastructure/backup.sh --quiet    # suppress progress output
set -euo pipefail

HD_HOME="/opt/hellodeploy"
HD_DATA="/var/lib/hellodeploy"
BACKUP_ROOT="/var/backups/hellodeploy"
QUIET=false
OUTPUT_DIR=""
SKIP_DATABASE=false

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
    --skip-database) SKIP_DATABASE=true; shift ;;
    *) error "Unknown argument: $1"; exit 1 ;;
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
  error ".env not found at $HD_HOME/.env"
  exit 1
fi

# ─── data directory ───────────────────────────────────────────────────────────

if [[ -d "$HD_DATA" ]]; then
  info "Archiving $HD_DATA…"
  tar -czf "$WORK_DIR/hellodeploy-data.tar.gz" -C "$(dirname "$HD_DATA")" "$(basename "$HD_DATA")"
  info "Archived $(du -sh "$WORK_DIR/hellodeploy-data.tar.gz" | cut -f1)"
else
  error "$HD_DATA not found"
  exit 1
fi

# ─── routing state ───────────────────────────────────────────────────────────

if [[ -d /etc/nginx/hellodeploy.d ]]; then
  tar -czf "$WORK_DIR/nginx-routes.tar.gz" -C /etc/nginx hellodeploy.d
  info "Archived generated Nginx routes"
fi
if [[ -f /etc/nginx/conf.d/hellodeploy-platform.conf ]]; then
  cp /etc/nginx/conf.d/hellodeploy-platform.conf "$WORK_DIR/hellodeploy-platform.conf"
  info "Copied platform ingress"
fi

# ─── MongoDB dump ─────────────────────────────────────────────────────────────

DATABASE_MODE="included"
if $SKIP_DATABASE; then
  DATABASE_MODE="external"
  warn "Database dump explicitly skipped; verify the external snapshot before using this backup."
elif command -v mongodump &>/dev/null; then
  MONGO_URI=$(grep ^MONGODB_URI "$HD_HOME/.env" | cut -d= -f2- | tr -d '"')
  if [[ -n "$MONGO_URI" ]]; then
    info "Running mongodump…"
    if ! mongodump --uri="$MONGO_URI" --out="$WORK_DIR/mongodump" --quiet 2>/dev/null; then
      error "mongodump failed; backup is incomplete"
      exit 1
    fi
    tar -czf "$WORK_DIR/mongodb-dump.tar.gz" -C "$WORK_DIR" mongodump
    rm -rf "$WORK_DIR/mongodump"
    info "MongoDB dump archived"
  else
    error "MONGODB_URI is missing; use --skip-database only after verifying an external snapshot"
    exit 1
  fi
else
  error "mongodump is unavailable; use --skip-database only after verifying an external snapshot"
  exit 1
fi

# ─── manifest ────────────────────────────────────────────────────────────────

(
  cd "$WORK_DIR"
  find . -maxdepth 1 -type f ! -name 'CHECKSUMS.sha256' ! -name 'manifest.json' -printf '%f\n' \
    | sort | xargs -r sha256sum > CHECKSUMS.sha256
)

CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOST_NAME=$(hostname)
COMMIT_SHA=$(git -C "$HD_HOME" rev-parse --verify HEAD)
BACKUP_DIR="$WORK_DIR" CREATED_AT="$CREATED_AT" HOST_NAME="$HOST_NAME" COMMIT_SHA="$COMMIT_SHA" \
  DATABASE_MODE="$DATABASE_MODE" node --input-type=module -e '
    import { readdirSync, writeFileSync } from "node:fs";
    const files = readdirSync(process.env.BACKUP_DIR).filter((name) => name !== "manifest.json").sort();
    const manifest = {
      formatVersion: 1,
      createdAt: process.env.CREATED_AT,
      hostname: process.env.HOST_NAME,
      commitSha: process.env.COMMIT_SHA,
      databaseMode: process.env.DATABASE_MODE,
      files,
    };
    writeFileSync(`${process.env.BACKUP_DIR}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  '
chmod 600 "$WORK_DIR/CHECKSUMS.sha256" "$WORK_DIR/manifest.json"

# ─── done ────────────────────────────────────────────────────────────────────

$QUIET || echo ""
info "Backup complete: $WORK_DIR"
$QUIET || echo ""
$QUIET || echo "To restore this backup:"
$QUIET || echo "  sudo bash infrastructure/restore.sh $WORK_DIR"
$QUIET || echo ""
