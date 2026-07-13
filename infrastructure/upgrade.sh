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
QUEUE_STATE_FILE=""
KEEP_QUEUE_PAUSED=false
HOST_ROLE="${HELLODEPLOY_HOST_ROLE:-full}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${GREEN}[info]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}── $* ──${NC}"; }

install_service_units() {
  install -m 0644 infrastructure/systemd/hellodeploy-worker.service /etc/systemd/system/ || return 1
  install -m 0644 infrastructure/systemd/hellodeploy-nginx-helper.service /etc/systemd/system/ || return 1
  if [[ "$HOST_ROLE" == "full" ]]; then
    install -m 0644 infrastructure/systemd/hellodeploy-web.service /etc/systemd/system/ || return 1
  fi
  systemctl daemon-reload || return 1
}

verify_release() {
  local services=(hellodeploy-nginx-helper hellodeploy-worker)
  if [[ "$HOST_ROLE" == "full" ]]; then
    services+=(hellodeploy-web)
  fi
  systemctl is-active --quiet "${services[@]}" || return 1
  if [[ "$HOST_ROLE" == "full" ]]; then
    curl --fail --silent --show-error \
      "http://127.0.0.1:$(awk -F= '$1 == "PORT" {print $2}' .env)/ready" >/dev/null || return 1
  fi
  HELLODEPLOY_VERIFY_ROLE="$HOST_ROLE" bash infrastructure/verify-installation.sh
}

activate_checked_out_release() {
  section "Dependencies and configuration"
  npm ci --omit=dev || return 1
  if [[ "$HOST_ROLE" == "full" ]]; then
    sudo -u hellodeploy-web node scripts/validate-config.js --component web --require-production || return 1
  fi
  sudo -u hellodeploy-worker node scripts/validate-config.js --component worker --require-production || return 1

  section "Service and ingress configuration"
  install_service_units || return 1
  if [[ "$HOST_ROLE" == "full" ]]; then
    bash infrastructure/nginx/render-platform-ingress.sh "$HD_HOME/.env" || return 1
  fi

  section "Restarting services"
  local services=(hellodeploy-nginx-helper hellodeploy-worker)
  if [[ "$HOST_ROLE" == "full" ]]; then
    services+=(hellodeploy-web)
  fi
  systemctl restart "${services[@]}" || return 1

  section "Readiness check"
  sleep 3
  verify_release
}

rollback_release() {
  local previous_commit=$1

  git checkout --detach "$previous_commit" || return 1
  activate_checked_out_release
}

resume_upgrade_queue() {
  if [[ -n "$QUEUE_STATE_FILE" && -f "$QUEUE_STATE_FILE" ]]; then
    node scripts/queue-maintenance.js resume --state-file "$QUEUE_STATE_FILE"
  fi
}

cleanup_upgrade_state() {
  if [[ "$KEEP_QUEUE_PAUSED" == "true" ]]; then
    warn "Deployment queue remains paused because rollback verification failed."
  elif ! resume_upgrade_queue; then
    warn "Could not restore the deployment queue state; resume it manually after verification."
  fi
  [[ -z "$QUEUE_STATE_FILE" ]] || rm -f "$QUEUE_STATE_FILE"
}

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root.  Try: sudo bash $0"
  exit 1
fi
if [[ "$HOST_ROLE" != "full" && "$HOST_ROLE" != "worker" ]]; then
  error "HELLODEPLOY_HOST_ROLE must be full or worker."
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

# ─── queue pause and drain ────────────────────────────────────────────────────

section "Pausing deployment queue"
QUEUE_STATE_FILE=$(mktemp /tmp/hellodeploy-upgrade-queue.XXXXXX)
rm -f "$QUEUE_STATE_FILE"
trap cleanup_upgrade_state EXIT
node scripts/queue-maintenance.js pause-and-drain --state-file "$QUEUE_STATE_FILE"

# ─── resolve immutable release ───────────────────────────────────────────────

section "Pulling code"
git fetch --tags origin
NEW_COMMIT=$(git rev-parse --verify "${RELEASE_REF}^{commit}")
git checkout --detach "$NEW_COMMIT"
info "Updated to commit: $NEW_COMMIT"

if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
  warn "Already up to date ($NEW_COMMIT).  Continuing to reinstall dependencies and restart."
fi

# ─── activate and verify candidate ───────────────────────────────────────────

if ! activate_checked_out_release; then
  error "The candidate release failed installation, configuration, restart, or verification."
  error "Rolling back to $PREV_COMMIT…"
  if rollback_release "$PREV_COMMIT"; then
    error "Rollback verified at $PREV_COMMIT. Investigate the logs: journalctl -u 'hellodeploy-*'"
  else
    KEEP_QUEUE_PAUSED=true
    error "CRITICAL: rollback to $PREV_COMMIT failed verification. Services may be unavailable."
    error "Inspect immediately: journalctl -u 'hellodeploy-*'"
  fi
  exit 1
fi

resume_upgrade_queue
rm -f "$QUEUE_STATE_FILE"
QUEUE_STATE_FILE=""
trap - EXIT

echo ""
echo -e "${GREEN}${BOLD}Upgrade complete!${NC}"
echo "  Previous commit: $PREV_COMMIT"
echo "  Current commit:  $NEW_COMMIT"
echo "  Backup at:       $BACKUP_PATH"
echo ""
