#!/usr/bin/env bash
# Install the HelloDeploy on-demand builder (rootless BuildKit) on this host.
#
# Additive and idempotent. It never restarts or reconfigures Docker, nginx,
# cloudflared, the HelloDeploy web or worker services, or any application
# container. The builder unit is installed disabled and is not started.
#
# Usage: sudo bash infrastructure/builder/install-builder.sh [--test-user NAME]
#   --test-user NAME  also let NAME start/stop the builder and use its socket,
#                     for Phase C isolated testing. Remove with uninstall-builder.sh.
set -euo pipefail

BUILDKIT_VERSION="v0.34.0"
BUILDKIT_SHA256="14813b1fb2a40082114e6d386c6fc5e7dd5298176ce7ee1a18bc33e73e109ac3"
ORAS_VERSION="1.3.4"
ORAS_SHA256="f27adb935022d94df8dc77719c322dda592c78a0d57a6f7dcdd8d900b248c454"

BUILDER_USER="hellodeploy-builder"
CONTROL_GROUP="hellodeploy-builder-control"
WORKER_USER="hellodeploy-worker"
SUBID_START=200000
SUBID_COUNT=65536
UNIT="hellodeploy-buildkitd.service"
STORE_PATH="/var/lib/hellodeploy-builder"
STORE_IMAGE="/var/lib/hellodeploy-builder.img"
STORE_SIZE="30G"
BIN_DIR="/usr/local/lib/hellodeploy-builder/bin"
CONFIG_DIR="/etc/hellodeploy-builder"
POLKIT_RULE="/etc/polkit-1/rules.d/50-hellodeploy-builder.rules"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_USER=""

fail() {
  printf 'install-builder: %s\n' "$1" >&2
  exit 1
}
step() {
  printf '\n== %s\n' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --test-user)
      TEST_USER="${2:-}"
      shift 2
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail "run with sudo."
[[ -z "$TEST_USER" ]] || id "$TEST_USER" >/dev/null 2>&1 || fail "no such user: $TEST_USER"
id "$WORKER_USER" >/dev/null 2>&1 || fail "the $WORKER_USER user does not exist."
if systemctl is-active --quiet "$UNIT"; then
  fail "$UNIT is running; stop it before reinstalling."
fi
for file in hellodeploy-buildkitd.service buildkitd.toml egress.nft 50-hellodeploy-builder.rules; do
  [[ -f "$SOURCE_DIR/$file" ]] || fail "missing $SOURCE_DIR/$file"
done

step "Packages: uidmap (newuidmap/newgidmap) and slirp4netns"
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends uidmap slirp4netns

step "BuildKit $BUILDKIT_VERSION and ORAS $ORAS_VERSION (checksums pinned)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
curl -fsSL -o "$WORK_DIR/buildkit.tgz" \
  "https://github.com/moby/buildkit/releases/download/$BUILDKIT_VERSION/buildkit-$BUILDKIT_VERSION.linux-amd64.tar.gz"
echo "$BUILDKIT_SHA256  $WORK_DIR/buildkit.tgz" | sha256sum -c --quiet
curl -fsSL -o "$WORK_DIR/oras.tgz" \
  "https://github.com/oras-project/oras/releases/download/v$ORAS_VERSION/oras_${ORAS_VERSION}_linux_amd64.tar.gz"
echo "$ORAS_SHA256  $WORK_DIR/oras.tgz" | sha256sum -c --quiet
mkdir -p "$WORK_DIR/buildkit" "$WORK_DIR/oras" "$BIN_DIR"
tar -xzf "$WORK_DIR/buildkit.tgz" -C "$WORK_DIR/buildkit" bin/buildkitd bin/buildctl bin/buildkit-runc
tar -xzf "$WORK_DIR/oras.tgz" -C "$WORK_DIR/oras" oras
install -m 0755 -o root -g root "$WORK_DIR/buildkit/bin/buildkitd" "$WORK_DIR/buildkit/bin/buildctl" \
  "$WORK_DIR/buildkit/bin/buildkit-runc" "$BIN_DIR/"
# buildkitd looks for runc on PATH by its plain name.
ln -sfn buildkit-runc "$BIN_DIR/runc"
install -m 0755 -o root -g root "$WORK_DIR/oras/oras" /usr/local/bin/oras

step "Builder user $BUILDER_USER and group $CONTROL_GROUP"
if ! id "$BUILDER_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$STORE_PATH" --no-create-home \
    --shell /usr/sbin/nologin "$BUILDER_USER"
fi
if ! grep -q "^$BUILDER_USER:" /etc/subuid; then
  usermod --add-subuids "$SUBID_START-$((SUBID_START + SUBID_COUNT - 1))" \
    --add-subgids "$SUBID_START-$((SUBID_START + SUBID_COUNT - 1))" "$BUILDER_USER"
fi
getent group "$CONTROL_GROUP" >/dev/null || groupadd --system "$CONTROL_GROUP"
# Membership takes effect at the worker's next normal restart; this script
# does not restart it.
for member in "$WORKER_USER" ${TEST_USER:+"$TEST_USER"}; do
  usermod --append --groups "$CONTROL_GROUP,$BUILDER_USER" "$member"
done

step "Fixed-size build cache store ($STORE_SIZE) at $STORE_PATH"
MOUNT_UNIT="$(systemd-escape --path --suffix=mount "$STORE_PATH")"
if [[ ! -f "$STORE_IMAGE" ]]; then
  fallocate -l "$STORE_SIZE" "$STORE_IMAGE"
  chmod 0600 "$STORE_IMAGE"
  mkfs.ext4 -q -m 0 -L hdbuilder "$STORE_IMAGE"
fi
mkdir -p "$STORE_PATH"
cat >"/etc/systemd/system/$MOUNT_UNIT" <<UNIT
# HelloDeploy on-demand builder cache: a fixed-size image, so the builder can
# never fill the host disk.
[Unit]
Description=HelloDeploy builder cache store

[Mount]
What=$STORE_IMAGE
Where=$STORE_PATH
Type=ext4
Options=loop,nodev,nosuid,noatime

[Install]
WantedBy=local-fs.target
UNIT
systemctl daemon-reload
systemctl enable --now "$MOUNT_UNIT"
chown "$BUILDER_USER:$BUILDER_USER" "$STORE_PATH"
chmod 0700 "$STORE_PATH"

step "Configuration, egress firewall, unit, and polkit rule"
install -d -m 0755 "$CONFIG_DIR"
install -m 0644 "$SOURCE_DIR/buildkitd.toml" "$CONFIG_DIR/buildkitd.toml"
install -m 0644 "$SOURCE_DIR/egress.nft" "$CONFIG_DIR/egress.nft"
nft -c -f "$CONFIG_DIR/egress.nft"
install -m 0644 "$SOURCE_DIR/hellodeploy-buildkitd.service" "/etc/systemd/system/$UNIT"
install -m 0644 "$SOURCE_DIR/50-hellodeploy-builder.rules" "$POLKIT_RULE"
systemctl daemon-reload
systemd-analyze verify "/etc/systemd/system/$UNIT"
# Installed, never enabled: only an administrator's Start runs it.
systemctl disable "$UNIT" >/dev/null 2>&1 || true

step "Done"
printf 'Unit:   %s (%s, %s)\n' "$UNIT" "$(systemctl is-enabled "$UNIT" 2>/dev/null || true)" \
  "$(systemctl is-active "$UNIT" 2>/dev/null || true)"
printf 'Store:  %s\n' "$(df -h --output=size,avail "$STORE_PATH" | tail -1)"
printf 'Next:   sudo bash %s/verify-builder.sh\n' "$SOURCE_DIR"
