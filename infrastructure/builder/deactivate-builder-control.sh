#!/usr/bin/env bash
# Undo activate-builder-control.sh: stop the builder, remove the marked block
# from /opt/hellodeploy/.env, and restart only hellodeploy-worker and
# hellodeploy-web with the deployment queue paused and drained. Releases
# already built stay live and can still roll back; new Next.js builds are
# refused until builder control is turned on again.
#
# Usage: sudo bash infrastructure/builder/deactivate-builder-control.sh [--remove-credentials]
#   --remove-credentials  also delete the worker's GHCR token file and Docker login
set -euo pipefail

HD_HOME="/opt/hellodeploy"
ENV_FILE="$HD_HOME/.env"
WORKER_USER="hellodeploy-worker"
WORKER_HOME="/var/lib/hellodeploy"
MARK_BEGIN="# >>> HelloDeploy builder control (activate-builder-control.sh)"
MARK_END="# <<< HelloDeploy builder control"
REMOVE_CREDENTIALS=false

[[ "${1:-}" == "--remove-credentials" ]] && REMOVE_CREDENTIALS=true
[[ $EUID -eq 0 ]] || {
  echo "deactivate-builder-control: run with sudo." >&2
  exit 1
}

systemctl stop hellodeploy-buildkitd.service 2>/dev/null || true

if grep -qF "$MARK_BEGIN" "$ENV_FILE"; then
  BACKUP="/var/backups/hellodeploy-env-$(date +%Y%m%d-%H%M%S)"
  cp -a "$ENV_FILE" "$BACKUP"
  chmod 0600 "$BACKUP"
  sed -i "/^$MARK_BEGIN\$/,/^$MARK_END\$/d" "$ENV_FILE"
  echo "Removed the builder control block from $ENV_FILE (backup: $BACKUP)."

  QUEUE_STATE_FILE="$(mktemp /tmp/hellodeploy-builder-queue.XXXXXX)"
  rm -f "$QUEUE_STATE_FILE"
  (cd "$HD_HOME" && node scripts/queue-maintenance.js pause-and-drain --state-file "$QUEUE_STATE_FILE")
  systemctl restart hellodeploy-worker hellodeploy-web
  sleep 5
  (cd "$HD_HOME" && node scripts/queue-maintenance.js resume --state-file "$QUEUE_STATE_FILE")
  rm -f "$QUEUE_STATE_FILE"
else
  echo "No builder control block in $ENV_FILE; services were not restarted."
fi

if $REMOVE_CREDENTIALS; then
  rm -f "$WORKER_HOME/ghcr-packages-token"
  runuser -u "$WORKER_USER" -- env HOME="$WORKER_HOME" docker logout ghcr.io >/dev/null 2>&1 || true
  echo "Removed the worker's GHCR token file and Docker login. Revoke the token on GitHub too."
fi
systemctl is-active hellodeploy-worker hellodeploy-web
