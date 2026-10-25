#!/usr/bin/env bash
# Verify the HelloDeploy on-demand builder after install-builder.sh.
#
# Starts the builder unit once as the worker user (through polkit, exactly as
# the worker would), runs isolation probes as the builder user, and stops it.
# It touches no other service. Exit status is nonzero if any check fails.
#
# Usage: sudo bash infrastructure/builder/verify-builder.sh
set -uo pipefail

UNIT="hellodeploy-buildkitd.service"
BUILDER_USER="hellodeploy-builder"
WORKER_USER="hellodeploy-worker"
SOCKET="/run/hellodeploy-builder/buildkitd.sock"
CGROUP="/sys/fs/cgroup/system.slice/$UNIT"
FAILURES=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() {
  printf 'FAIL  %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi
}
refuse() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then fail "$label"; else pass "$label"; fi
}
as_worker() { runuser -u "$WORKER_USER" -- systemctl --no-ask-password "$@"; }
as_builder() { runuser -u "$BUILDER_USER" -- "$@"; }
# A TCP connection attempt from the builder user over IPv4, up to three tries,
# so one slow name lookup or handshake does not read as blocked.
builder_connects() {
  local address
  address="$(getent ahostsv4 "$1" | awk 'NR == 1 { print $1 }')"
  [[ -n "$address" ]] || return 1
  for _ in 1 2 3; do
    as_builder timeout 5 bash -c "exec 3<>/dev/tcp/$address/$2" 2>/dev/null && return 0
  done
  return 1
}

[[ $EUID -eq 0 ]] || {
  echo "verify-builder: run with sudo." >&2
  exit 1
}
if systemctl is-active --quiet "$UNIT"; then
  echo "verify-builder: $UNIT is already running; stop it first." >&2
  exit 1
fi

echo "== Installation"
# "static" (no [Install] section) cannot be enabled at all; is-enabled exits 0 for it.
check "unit cannot start at boot (static or disabled)" \
  bash -c "[[ \"\$(systemctl is-enabled $UNIT 2>/dev/null)\" =~ ^(static|disabled)\$ ]]"
check "build cache store is mounted" mountpoint -q /var/lib/hellodeploy-builder
check "builder user exists" id "$BUILDER_USER"
refuse "builder user is not in the docker group" bash -c "id -nG $BUILDER_USER | grep -qw docker"
check "newuidmap is installed" command -v newuidmap
check "slirp4netns is installed" command -v slirp4netns

echo "== polkit boundary (as $WORKER_USER)"
refuse "worker may not restart the builder (verb not allowed)" as_worker restart "$UNIT"
refuse "worker may not signal another service" as_worker kill --signal=SIGCONT cron.service
refuse "an unrelated user may not start the builder" \
  runuser -u nobody -- systemctl --no-ask-password start "$UNIT"
check "worker may start the builder" as_worker start "$UNIT"

for _ in $(seq 1 30); do
  [[ -S "$SOCKET" ]] && break
  sleep 1
done
check "builder is active" systemctl is-active --quiet "$UNIT"
check "BuildKit socket exists" test -S "$SOCKET"
check "BuildKit answers on its socket" \
  runuser -u "$WORKER_USER" -g "$BUILDER_USER" -- /usr/local/lib/hellodeploy-builder/bin/buildctl \
  --addr "unix://$SOCKET" debug workers
PROBE_DIR="$(mktemp -d /tmp/hellodeploy-builder-probe.XXXXXX)"
chmod 0755 "$PROBE_DIR"
printf 'FROM alpine:3.20\nRUN echo build-ok\n' >"$PROBE_DIR/Dockerfile"
check "a build can run a command in a rootless container" \
  runuser -u "$WORKER_USER" -g "$BUILDER_USER" -- timeout 180 \
  /usr/local/lib/hellodeploy-builder/bin/buildctl --addr "unix://$SOCKET" build \
  --frontend dockerfile.v0 --local "context=$PROBE_DIR" --local "dockerfile=$PROBE_DIR"
rm "$PROBE_DIR/Dockerfile"
rmdir "$PROBE_DIR"

echo "== Resource caps (cgroup)"
[[ "$(cat "$CGROUP/memory.max" 2>/dev/null)" == "$((1536 * 1024 * 1024))" ]] &&
  pass "memory.max is 1536 MiB" || fail "memory.max is 1536 MiB"
[[ "$(cat "$CGROUP/memory.swap.max" 2>/dev/null)" == "0" ]] &&
  pass "memory.swap.max is 0" || fail "memory.swap.max is 0"
[[ "$(cut -d' ' -f1 "$CGROUP/cpu.max" 2>/dev/null)" == "200000" ]] &&
  pass "cpu.max allows 2 cores" || fail "cpu.max allows 2 cores"
[[ "$(cat "$CGROUP/pids.max" 2>/dev/null)" == "512" ]] &&
  pass "pids.max is 512" || fail "pids.max is 512"

echo "== Isolation (as $BUILDER_USER, firewall loaded)"
check "egress firewall table is loaded" nft list table inet hellodeploy_builder
refuse "builder cannot use the Docker daemon socket" as_builder test -w /var/run/docker.sock
refuse "builder cannot read the HelloDeploy configuration" as_builder cat /opt/hellodeploy/.env
refuse "builder cannot reach the nginx helper socket" \
  as_builder test -w /run/hellodeploy/nginx-helper.sock
refuse "builder cannot reach local Redis (127.0.0.1:6379)" builder_connects 127.0.0.1 6379
refuse "builder cannot reach the web service (127.0.0.1:3100)" builder_connects 127.0.0.1 3100
refuse "builder cannot reach cloud metadata (169.254.169.254:80)" builder_connects 169.254.169.254 80
HOST_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") print $(i + 1)}')"
if [[ -n "$HOST_IP" ]]; then
  refuse "builder cannot reach this host's LAN address ($HOST_IP:80)" builder_connects "$HOST_IP" 80
fi
check "builder can reach a public registry over HTTPS (registry-1.docker.io:443)" \
  builder_connects registry-1.docker.io 443
# github.com:22 always listens, so a refusal here can only be the firewall.
refuse "builder cannot use other public ports (github.com:22)" builder_connects github.com 22

echo "== Stop and Emergency Stop"
check "worker may stop the builder" as_worker stop "$UNIT"
refuse "builder is inactive after stop" systemctl is-active --quiet "$UNIT"
refuse "egress firewall table is removed after stop" nft list table inet hellodeploy_builder
as_worker start "$UNIT" >/dev/null 2>&1
sleep 3
check "worker may kill the builder (Emergency Stop)" as_worker kill --signal=SIGKILL "$UNIT"
sleep 2
refuse "builder is inactive after kill" systemctl is-active --quiet "$UNIT"
refuse "egress firewall table is removed after kill" nft list table inet hellodeploy_builder
systemctl reset-failed "$UNIT" 2>/dev/null || true

echo
if [[ $FAILURES -eq 0 ]]; then
  echo "All builder checks passed."
else
  echo "$FAILURES builder check(s) failed."
fi
exit $((FAILURES > 0))
