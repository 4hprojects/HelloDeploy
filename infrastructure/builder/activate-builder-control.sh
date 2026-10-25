#!/usr/bin/env bash
# Phase D: turn on builder control in production for one allowlisted Next.js
# project. Run only with the owner's approval, after install-builder.sh and a
# passing verify-builder.sh.
#
# - Prompts once for a classic GitHub token (read:packages, write:packages,
#   delete:packages); it is never echoed, logged, or placed in .env.
# - Appends a marked block to /opt/hellodeploy/.env after a backup, and
#   restores the backup if validation or the restart check fails.
# - Pauses and drains the deployment queue, restarts only hellodeploy-worker
#   and hellodeploy-web (the restart gives the worker its builder groups), and
#   resumes the queue. Docker, nginx, cloudflared and app containers are untouched.
# - The builder itself stays stopped; a super administrator starts it from
#   /admin/builder.
#
# Usage: sudo bash infrastructure/builder/activate-builder-control.sh --project-id OBJECT_ID
# Undo:  sudo bash infrastructure/builder/deactivate-builder-control.sh
set -euo pipefail

HD_HOME="/opt/hellodeploy"
ENV_FILE="$HD_HOME/.env"
WORKER_USER="hellodeploy-worker"
WORKER_HOME="/var/lib/hellodeploy"
TOKEN_FILE="$WORKER_HOME/ghcr-packages-token"
REGISTRY="ghcr.io/4hprojects/hellodeploy-builds"
REGISTRY_USER="4hprojects"
BUILDX_NAME="hellodeploy-ondemand"
SOCKET="unix:///run/hellodeploy-builder/buildkitd.sock"
UNIT="hellodeploy-buildkitd.service"
MARK_BEGIN="# >>> HelloDeploy builder control (activate-builder-control.sh)"
MARK_END="# <<< HelloDeploy builder control"
PROJECT_ID=""
BACKUP=""
QUEUE_STATE_FILE=""

fail() {
  printf 'activate-builder-control: %s\n' "$1" >&2
  exit 1
}
step() {
  printf '\n== %s\n' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

step "Preflight"
[[ $EUID -eq 0 ]] || fail "run with sudo."
[[ "$PROJECT_ID" =~ ^[0-9a-f]{24}$ ]] || fail "--project-id must be a 24-character project ObjectId."
grep -q "BUILDER_CONTROL_ENABLED" "$HD_HOME/apps/worker/src/config/env.js" ||
  fail "the installed release has no builder control; deploy the release that includes it first."
[[ -f "/etc/systemd/system/$UNIT" && -f /etc/polkit-1/rules.d/50-hellodeploy-builder.rules ]] ||
  fail "the builder is not installed; run install-builder.sh and verify-builder.sh first."
if systemctl is-active --quiet "$UNIT"; then
  fail "$UNIT is running; stop it first."
fi
if grep -qF "$MARK_BEGIN" "$ENV_FILE"; then
  fail "builder control is already activated in $ENV_FILE."
fi
CONFLICTS="$(grep -E '^(BUILDER_CONTROL_[A-Z_]*|USER_IMAGE_REGISTRY|REGISTRY_MANIFEST_DELETE_ENABLED|REGISTRY_DELETE_API|GHCR_PACKAGES_[A-Z_]*|MULTIRUNTIME_[A-Z0-9_]*)=' "$ENV_FILE" | cut -d= -f1 || true)"
[[ -z "$CONFLICTS" ]] || fail "$ENV_FILE already sets: $(echo "$CONFLICTS" | tr '\n' ' ')- resolve these first."
if grep -qE '^BUILD_EXECUTOR=remote-buildkit' "$ENV_FILE"; then
  fail "BUILD_EXECUTOR=remote-buildkit is set; builder control keeps legacy builds local."
fi
if grep -qE '^WORKER_CONCURRENCY=' "$ENV_FILE" && ! grep -qE '^WORKER_CONCURRENCY=1$' "$ENV_FILE"; then
  fail "WORKER_CONCURRENCY must be 1 for builder control."
fi

restore_env() {
  if [[ -n "$BACKUP" && -f "$BACKUP" ]]; then
    cp -a "$BACKUP" "$ENV_FILE"
    printf 'Restored %s from %s.\n' "$ENV_FILE" "$BACKUP" >&2
  fi
}
resume_queue() {
  if [[ -n "$QUEUE_STATE_FILE" && -f "$QUEUE_STATE_FILE" ]]; then
    (cd "$HD_HOME" && node scripts/queue-maintenance.js resume --state-file "$QUEUE_STATE_FILE") || true
    rm -f "$QUEUE_STATE_FILE"
  fi
}

step "Worker registry credentials"
printf 'Paste the GitHub token for %s, then press Enter (input is hidden): ' "$REGISTRY_USER"
read -rs TOKEN
printf '\n'
[[ "$TOKEN" =~ ^ghp_[A-Za-z0-9]{36}$ ]] || fail "that is not a classic GitHub token (ghp_...)."
install -m 0400 -o "$WORKER_USER" -g "$WORKER_USER" /dev/null "$TOKEN_FILE"
printf '%s' "$TOKEN" >"$TOKEN_FILE"
printf '%s' "$TOKEN" | runuser -u "$WORKER_USER" -- env HOME="$WORKER_HOME" \
  docker login ghcr.io -u "$REGISTRY_USER" --password-stdin >/dev/null
unset TOKEN
echo "Token stored for $WORKER_USER only ($TOKEN_FILE, mode 0400) and in its Docker login."

step "Worker Buildx builder definition"
if ! runuser -u "$WORKER_USER" -- env HOME="$WORKER_HOME" docker buildx inspect "$BUILDX_NAME" >/dev/null 2>&1; then
  runuser -u "$WORKER_USER" -- env HOME="$WORKER_HOME" \
    docker buildx create --name "$BUILDX_NAME" --driver remote "$SOCKET" >/dev/null
fi
echo "$BUILDX_NAME -> $SOCKET"

step "Registry readiness (as $WORKER_USER)"
runuser -u "$WORKER_USER" -- env HOME="$WORKER_HOME" oras manifest fetch "$REGISTRY:hellodeploy-anchor" >/dev/null ||
  fail "the worker cannot read $REGISTRY:hellodeploy-anchor."
echo "The worker can read $REGISTRY."

step "Configuration"
BACKUP="/var/backups/hellodeploy-env-$(date +%Y%m%d-%H%M%S)"
cp -a "$ENV_FILE" "$BACKUP"
chmod 0600 "$BACKUP"
echo "Backup: $BACKUP"
cat >>"$ENV_FILE" <<ENV

$MARK_BEGIN
BUILDER_CONTROL_ENABLED=true
BUILDER_CONTROL_BUILDX_NAME=$BUILDX_NAME
BUILDER_CONTROL_ENDPOINT=$SOCKET
USER_IMAGE_REGISTRY=$REGISTRY
REGISTRY_MANIFEST_DELETE_ENABLED=true
REGISTRY_DELETE_API=github-packages
GHCR_PACKAGES_OWNER_TYPE=user
GHCR_PACKAGES_TOKEN_PATH=$TOKEN_FILE
MULTIRUNTIME_NEXT_V1_ENABLED=true
MULTIRUNTIME_NEXT_V1_PROJECT_IDS=$PROJECT_ID
$MARK_END
ENV
if ! (cd "$HD_HOME" && sudo -u hellodeploy-web node scripts/validate-config.js --component web --require-production >/dev/null &&
  sudo -u "$WORKER_USER" node scripts/validate-config.js --component worker --require-production >/dev/null); then
  restore_env
  fail "the new configuration did not validate; nothing was restarted."
fi
echo "Web and worker configuration valid."

step "Restart worker and web (queue paused and drained)"
QUEUE_STATE_FILE="$(mktemp /tmp/hellodeploy-builder-queue.XXXXXX)"
rm -f "$QUEUE_STATE_FILE"
if ! (cd "$HD_HOME" && node scripts/queue-maintenance.js pause-and-drain --state-file "$QUEUE_STATE_FILE"); then
  restore_env
  resume_queue
  fail "the deployment queue did not drain; nothing was restarted."
fi
CHECKS_OK=true
systemctl restart hellodeploy-worker hellodeploy-web || CHECKS_OK=false
sleep 8

CONTROL_GID="$(getent group hellodeploy-builder-control | cut -d: -f3)"
WORKER_PID="$(systemctl show -p MainPID --value hellodeploy-worker)"
systemctl is-active --quiet hellodeploy-worker || CHECKS_OK=false
systemctl is-active --quiet hellodeploy-web || CHECKS_OK=false
grep -E '^Groups:' "/proc/$WORKER_PID/status" 2>/dev/null | grep -qw "$CONTROL_GID" || CHECKS_OK=false
journalctl -u hellodeploy-worker --since "-1 min" --no-pager 2>/dev/null |
  grep -q "builder control enabled" || CHECKS_OK=false
if ! $CHECKS_OK; then
  echo "The restarted services did not pass their checks; restoring the previous configuration." >&2
  restore_env
  systemctl restart hellodeploy-worker hellodeploy-web
  sleep 5
  resume_queue
  exit 1
fi
resume_queue

step "Done"
echo "Worker and web are running with builder control on; the builder is stopped."
echo "Next, as a super administrator:"
echo "  1. Open /admin/builder, allow Next.js and tick the pilot project, and save."
echo "  2. Select the Next.js build strategy in the pilot project's build settings."
echo "  3. Start the build service, then deploy the pilot project."
echo "Backup of the previous configuration: $BACKUP"
