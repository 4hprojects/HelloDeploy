#!/usr/bin/env bash
# Remove a previously activated wildcard ingress rule from every connector for the
# dashboard tunnel. Mirrors activate-wildcard-tunnel-ingress.sh's fail-closed
# backup/validate/restart/verify/rollback shape, inverted.
set -euo pipefail

EXPECTED_COMMIT="${HELLODEPLOY_EXPECTED_RELEASE_COMMIT:-}"
HD_HOME="/opt/hellodeploy"
OLD_WILDCARD_HOSTNAME="*.apps.hellodeploy.online"
CONFIGS=(/etc/cloudflared/config.yml /etc/cloudflared/hellodeploy.yml)
SERVICES=(cloudflared.service cloudflared-hellodeploy.service)
BACKUP_ROOT="/var/lib/hellodeploy/tunnel-backups"
BACKUP_DIR=""
CHANGED=false
CURRENT_STAGE="preflight"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "Run wildcard tunnel deactivation as root."
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  fail "HELLODEPLOY_EXPECTED_RELEASE_COMMIT must be a full commit."
fi
if [[ "$(git -C "$HD_HOME" rev-parse --verify HEAD^{commit} 2>/dev/null || true)" != "$EXPECTED_COMMIT" ]] ||
  [[ -n "$(git -C "$HD_HOME" status --porcelain 2>/dev/null || true)" ]]; then
  fail "Installed release is missing, dirty, or does not match the expected commit."
fi
if systemctl is-active --quiet hellodeploy-worker; then
  fail "Deployment worker must remain inactive during wildcard ingress deactivation."
fi
if ! systemctl is-active --quiet hellodeploy-nginx-helper; then
  fail "Nginx helper must be active before wildcard ingress deactivation."
fi

run_as_worker() {
  (
    cd "$HD_HOME"
    runuser -u hellodeploy-worker -- \
      env NODE_ENV=production \
      /usr/bin/node scripts/verify-nginx-helper-live.js --check-queue-only
  )
}

wait_for_url() {
  local url=$1
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 15 "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

verify_public_fallbacks() {
  wait_for_url https://hellodeploy.online/health || return 1
  wait_for_url https://hellorun.online/ || return 1
  for _ in $(seq 1 7); do
    curl -fsS --max-time 15 https://hellodeploy.online/health >/dev/null || return 1
  done
}

rollback() {
  local status=$?
  if ((status == 0)); then
    return
  fi

  printf 'Wildcard tunnel deactivation failed during %s; restoring both connector configs.\n' \
    "$CURRENT_STAGE" >&2
  if [[ "$CHANGED" == true && -n "$BACKUP_DIR" ]]; then
    for config in "${CONFIGS[@]}"; do
      install -m 0644 -o root -g root "$BACKUP_DIR/$(basename "$config")" "$config"
    done
    for service in "${SERVICES[@]}"; do
      systemctl restart "$service" >/dev/null 2>&1 || true
    done
    if ! verify_public_fallbacks; then
      printf 'CRITICAL: tunnel rollback verification failed; keep the queue paused.\n' >&2
    fi
  fi
}
trap rollback EXIT

run_as_worker

for index in "${!CONFIGS[@]}"; do
  config="${CONFIGS[$index]}"
  service="${SERVICES[$index]}"
  [[ -f "$config" && ! -L "$config" ]] || fail "Required tunnel config is missing or unsafe."
  [[ "$(stat -c '%U:%G:%a' "$config")" == "root:root:644" ]] ||
    fail "Tunnel config metadata differs from the reviewed baseline."
  systemctl is-active --quiet "$service" || fail "Required tunnel connector is inactive."
  cloudflared tunnel --config "$config" ingress validate >/dev/null
  if ! grep -Fq "$OLD_WILDCARD_HOSTNAME" "$config"; then
    fail "Wildcard ingress is already absent; refusing an ambiguous retry."
  fi
done

primary_tunnel=$(awk -F: '$1 == "tunnel" {gsub(/[[:space:]]/, "", $2); print $2; exit}' "${CONFIGS[0]}")
secondary_tunnel=$(awk -F: '$1 == "tunnel" {gsub(/[[:space:]]/, "", $2); print $2; exit}' "${CONFIGS[1]}")
[[ -n "$primary_tunnel" && "$primary_tunnel" == "$secondary_tunnel" ]] ||
  fail "Dashboard connectors do not reference the same tunnel."
unset primary_tunnel secondary_tunnel

CURRENT_STAGE="backup"
install -d -m 0700 -o root -g root "$BACKUP_ROOT"
BACKUP_DIR=$(mktemp -d "$BACKUP_ROOT/p2-wildcard-deactivate.XXXXXX")
chmod 0700 "$BACKUP_DIR"

CURRENT_STAGE="candidate-validation"
for config in "${CONFIGS[@]}"; do
  install -m 0600 -o root -g root "$config" "$BACKUP_DIR/$(basename "$config")"
  candidate="$BACKUP_DIR/$(basename "$config").candidate"
  awk -v hostname="$OLD_WILDCARD_HOSTNAME" '
    $0 == "  - hostname: \"" hostname "\"" && !removed {
      if ((getline nextline) <= 0 || nextline != "    service: http://localhost:80") {
        print "wildcard entry has an unexpected shape" > "/dev/stderr"
        exit 43
      }
      removed = 1
      next
    }
    { print }
    END { if (!removed) exit 42 }
  ' "$config" >"$candidate"
  chmod 0600 "$candidate"
  cloudflared tunnel --config "$candidate" ingress validate >/dev/null
done

CURRENT_STAGE="config-install"
for config in "${CONFIGS[@]}"; do
  install -m 0644 -o root -g root "$BACKUP_DIR/$(basename "$config").candidate" "$config"
done
CHANGED=true

CURRENT_STAGE="connector-restart"
for service in "${SERVICES[@]}"; do
  systemctl restart "$service"
  systemctl is-active --quiet "$service"
done

CURRENT_STAGE="rule-verification"
for config in "${CONFIGS[@]}"; do
  cloudflared tunnel --config "$config" ingress validate >/dev/null
  if grep -Fq "$OLD_WILDCARD_HOSTNAME" "$config"; then
    fail "Old wildcard ingress rule is still present after removal."
  fi
done

CURRENT_STAGE="public-convergence"
verify_public_fallbacks
CURRENT_STAGE="queue-recheck"
run_as_worker

trap - EXIT
printf 'wildcard_local_ingress=removed\n'
printf 'dashboard_connectors=active\n'
printf 'public_fallbacks=passed\n'
printf 'worker_state=inactive\n'
printf 'queue_state=paused\n'
printf 'tunnel_ingress_backup=created\n'
