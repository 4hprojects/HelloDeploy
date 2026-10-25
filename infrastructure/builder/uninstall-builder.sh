#!/usr/bin/env bash
# Remove the HelloDeploy on-demand builder installed by install-builder.sh.
#
# Stops only the builder unit. Never touches Docker, nginx, cloudflared, the
# HelloDeploy web or worker services, or application containers. The packages
# uidmap and slirp4netns are left installed.
#
# Usage: sudo bash infrastructure/builder/uninstall-builder.sh [--test-user NAME] [--delete-store]
#   --test-user NAME  remove NAME from the builder groups
#   --delete-store    also delete the 30 GB cache image (only build cache is lost)
set -euo pipefail

BUILDER_USER="hellodeploy-builder"
CONTROL_GROUP="hellodeploy-builder-control"
WORKER_USER="hellodeploy-worker"
UNIT="hellodeploy-buildkitd.service"
STORE_PATH="/var/lib/hellodeploy-builder"
STORE_IMAGE="/var/lib/hellodeploy-builder.img"
TEST_USER=""
DELETE_STORE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --test-user)
      TEST_USER="${2:-}"
      shift 2
      ;;
    --delete-store)
      DELETE_STORE=true
      shift
      ;;
    *)
      echo "uninstall-builder: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done
[[ $EUID -eq 0 ]] || {
  echo "uninstall-builder: run with sudo." >&2
  exit 1
}

systemctl stop "$UNIT" 2>/dev/null || true
nft delete table inet hellodeploy_builder 2>/dev/null || true
rm -f "/etc/systemd/system/$UNIT" /etc/polkit-1/rules.d/50-hellodeploy-builder.rules
rm -rf /etc/hellodeploy-builder /usr/local/lib/hellodeploy-builder
rm -f /usr/local/bin/oras

MOUNT_UNIT="$(systemd-escape --path --suffix=mount "$STORE_PATH")"
systemctl disable --now "$MOUNT_UNIT" 2>/dev/null || true
rm -f "/etc/systemd/system/$MOUNT_UNIT"
systemctl daemon-reload
if $DELETE_STORE; then
  rm -f "$STORE_IMAGE"
  rmdir "$STORE_PATH" 2>/dev/null || true
fi

for member in "$WORKER_USER" ${TEST_USER:+"$TEST_USER"}; do
  gpasswd -d "$member" "$CONTROL_GROUP" >/dev/null 2>&1 || true
  gpasswd -d "$member" "$BUILDER_USER" >/dev/null 2>&1 || true
done
groupdel "$CONTROL_GROUP" 2>/dev/null || true
if id "$BUILDER_USER" >/dev/null 2>&1; then
  userdel "$BUILDER_USER"
fi
sed -i "/^$BUILDER_USER:/d" /etc/subuid /etc/subgid

echo "The on-demand builder is removed.$($DELETE_STORE || echo " The cache image $STORE_IMAGE was kept.")"
