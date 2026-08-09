#!/usr/bin/env bash
# Deliberately revert dashboard traffic from the isolated hellodeploy-web service
# back to the PM2 pilot. Distinct from activate-dashboard-cutover.sh's automatic
# rollback-on-failure: this is for a deliberate, after-the-fact reversion, and it
# proves the restoration path actually works rather than leaving it theoretical.
set -euo pipefail

EXPECTED_COMMIT="${HELLODEPLOY_EXPECTED_RELEASE_COMMIT:-}"
HD_HOME="/opt/hellodeploy"
CONFIGS=(/etc/cloudflared/config.yml /etc/cloudflared/hellodeploy.yml)
SERVICES=(cloudflared.service cloudflared-hellodeploy.service)
LEGACY_VHOST_LINK="/etc/nginx/sites-enabled/hellodeploy"
LEGACY_VHOST_TARGET="/etc/nginx/sites-available/hellodeploy"
PLATFORM_VHOST="/etc/nginx/conf.d/hellodeploy-platform.conf"
BACKUP_ROOT="/var/lib/hellodeploy/tunnel-backups"
BACKUP_DIR=""
CHANGED=false
NGINX_REVERTED=false
CURRENT_STAGE="preflight"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "Run dashboard cutover revert as root."
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  fail "HELLODEPLOY_EXPECTED_RELEASE_COMMIT must be a full commit."
fi
if [[ "$(git -C "$HD_HOME" rev-parse --verify HEAD^{commit} 2>/dev/null || true)" != "$EXPECTED_COMMIT" ]] ||
  [[ -n "$(git -C "$HD_HOME" status --porcelain 2>/dev/null || true)" ]]; then
  fail "Installed release is missing, dirty, or does not match the expected commit."
fi
if [[ ! -f "$PLATFORM_VHOST" ]]; then
  fail "Platform Nginx vhost is absent; refusing an ambiguous revert."
fi
if [[ -L "$LEGACY_VHOST_LINK" ]]; then
  fail "Legacy PM2 vhost is already enabled; refusing an ambiguous revert."
fi

run_as_worker() {
  (
    cd "$HD_HOME"
    runuser -u hellodeploy-worker -- \
      env NODE_ENV=production \
      /usr/bin/node scripts/verify-nginx-helper-live.js "$@"
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
}

rollback() {
  local status=$?
  if ((status == 0)); then
    return
  fi

  printf 'Dashboard cutover revert failed during %s; restoring the isolated-service path.\n' \
    "$CURRENT_STAGE" >&2

  if [[ "$CHANGED" == true && -n "$BACKUP_DIR" ]]; then
    for config in "${CONFIGS[@]}"; do
      install -m 0644 -o root -g root "$BACKUP_DIR/$(basename "$config")" "$config"
    done
    for service in "${SERVICES[@]}"; do
      systemctl restart "$service" >/dev/null 2>&1 || true
    done
  fi

  # The restored tunnel config (above) points hellodeploy.online back at Nginx --
  # the isolated-service state -- regardless of which stage failed. If the Nginx
  # side had already been switched to the legacy vhost, it must be switched back
  # to the platform vhost so the two stay consistent; leaving Nginx on the legacy
  # vhost while the tunnel points at Nginx would serve the dead legacy backend.
  if [[ "$NGINX_REVERTED" == true ]]; then
    rm -f "$LEGACY_VHOST_LINK"
    bash "$HD_HOME/infrastructure/nginx/configure-platform-ingress.sh" "$HD_HOME/.env" >/dev/null 2>&1 || true
  fi

  # Only hellodeploy.online is this script's own responsibility to restore; HelloRun
  # can be unhealthy for reasons entirely outside this script's control (its own
  # backend process), and that must not be reported as this rollback having failed.
  if ! wait_for_url https://hellodeploy.online/health; then
    printf 'CRITICAL: dashboard rollback verification failed; keep the queue paused.\n' >&2
  fi
}
trap rollback EXIT

CURRENT_STAGE="pm2-precheck"
wait_for_url http://127.0.0.1:3001/health || fail "PM2 pilot is not responding; refusing to route traffic to it."

CURRENT_STAGE="backup"
install -d -m 0700 -o root -g root "$BACKUP_ROOT"
BACKUP_DIR=$(mktemp -d "$BACKUP_ROOT/p2-revert.XXXXXX")
chmod 0700 "$BACKUP_DIR"
for config in "${CONFIGS[@]}"; do
  install -m 0600 -o root -g root "$config" "$BACKUP_DIR/$(basename "$config")"
done

CURRENT_STAGE="candidate-validation"
for config in "${CONFIGS[@]}"; do
  candidate="$BACKUP_DIR/$(basename "$config").candidate"
  awk '
    BEGIN { count = 0 }
    /^  - hostname: (www\.)?hellodeploy\.online$/ {
      print
      if ((getline nextline) <= 0 || nextline != "    service: http://localhost:80") {
        print "revert target line has an unexpected shape" > "/dev/stderr"
        exit 44
      }
      print "    service: http://localhost:3001"
      count++
      next
    }
    { print }
    END { if (count != 2) exit 45 }
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

CURRENT_STAGE="nginx-vhost-revert"
rm -f "$PLATFORM_VHOST"
ln -s "$LEGACY_VHOST_TARGET" "$LEGACY_VHOST_LINK"
NGINX_REVERTED=true
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
else
  fail "Nginx configuration is invalid after restoring the legacy vhost."
fi

CURRENT_STAGE="public-verification"
wait_for_url https://hellodeploy.online/health || fail "Public dashboard health check did not converge after revert."

CURRENT_STAGE="fallback-verification"
wait_for_url https://hellorun.online/ || fail "HelloRun fallback check did not converge after revert."

CURRENT_STAGE="queue-recheck"
run_as_worker --check-queue-only

trap - EXIT
printf 'legacy_vhost=enabled\n'
printf 'dashboard_nginx_vhost=removed\n'
printf 'tunnel_ingress=reverted\n'
printf 'dashboard_health=passed\n'
printf 'public_fallbacks=passed\n'
printf 'queue_state=paused\n'
printf 'traffic_cutover=reverted\n'
