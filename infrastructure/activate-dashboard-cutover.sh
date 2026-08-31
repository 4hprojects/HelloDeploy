#!/usr/bin/env bash
# Cut dashboard traffic from the PM2 pilot to the isolated hellodeploy-web service.
set -euo pipefail

EXPECTED_COMMIT="${HELLODEPLOY_EXPECTED_RELEASE_COMMIT:-}"
HD_HOME="/opt/hellodeploy"
CONFIGS=(/etc/cloudflared/config.yml /etc/cloudflared/hellodeploy.yml)
SERVICES=(cloudflared.service cloudflared-hellodeploy.service)
CANDIDATE_SERVICES=(hellodeploy-web hellodeploy-worker)
LEGACY_VHOST_LINK="/etc/nginx/sites-enabled/hellodeploy"
LEGACY_VHOST_TARGET="/etc/nginx/sites-available/hellodeploy"
PLATFORM_VHOST="/etc/nginx/conf.d/hellodeploy-platform.conf"
BACKUP_ROOT="/var/lib/hellodeploy/tunnel-backups"
BACKUP_DIR=""
CHANGED=false
LEGACY_VHOST_REMOVED=false
PERSISTENCE_CHANGED=false
WEB_WAS_ENABLED=false
WORKER_WAS_ENABLED=false
CURRENT_STAGE="preflight"
RESPONSE_BODY=""

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "Run dashboard cutover as root."
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  fail "HELLODEPLOY_EXPECTED_RELEASE_COMMIT must be a full commit."
fi
if [[ "$(git -C "$HD_HOME" rev-parse --verify HEAD^{commit} 2>/dev/null || true)" != "$EXPECTED_COMMIT" ]] ||
  [[ -n "$(git -C "$HD_HOME" status --porcelain 2>/dev/null || true)" ]]; then
  fail "Installed release is missing, dirty, or does not match the expected commit."
fi
if ! systemctl is-active --quiet hellodeploy-web; then
  fail "Candidate web service must be active before cutover."
fi
if ! systemctl is-active --quiet hellodeploy-worker; then
  fail "Candidate worker service must be active before cutover."
fi
if ! systemctl is-active --quiet hellodeploy-nginx-helper; then
  fail "Nginx helper must be active before cutover."
fi
if systemctl is-enabled --quiet hellodeploy-web 2>/dev/null; then
  WEB_WAS_ENABLED=true
fi
if systemctl is-enabled --quiet hellodeploy-worker 2>/dev/null; then
  WORKER_WAS_ENABLED=true
fi
if ! nginx -t >/dev/null 2>&1; then
  fail "Existing Nginx configuration is invalid."
fi
if [[ -f "$PLATFORM_VHOST" ]]; then
  fail "Platform Nginx vhost already exists; refusing an ambiguous retry."
fi

if [[ -f "$HD_HOME/.env" ]]; then
  PORT=$(awk -F= '$1 == "PORT" {value=$2; gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", value); print value; exit}' "$HD_HOME/.env")
else
  PORT=""
fi
if [[ ! "$PORT" =~ ^[0-9]+$ || "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  fail "Candidate web port is invalid."
fi

run_as_worker() {
  (
    cd "$HD_HOME"
    runuser -u hellodeploy-worker -- \
      env NODE_ENV=production \
      /usr/bin/node scripts/verify-nginx-helper-live.js "$@"
  )
}

check_worker_readiness() {
  (
    cd "$HD_HOME"
    runuser -u hellodeploy-worker -- \
      env NODE_ENV=production \
      /usr/bin/node scripts/check-worker-readiness.js
  )
}

wait_for_response() {
  local url=$1
  local attempt
  for attempt in $(seq 1 30); do
    if RESPONSE_BODY=$(curl --fail --max-time 5 -sS "$url" 2>/dev/null); then
      return 0
    fi
    sleep 1
  done
  return 1
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
  wait_for_url https://hellorun.online/ || return 1
}

rollback() {
  local status=$?
  if ((status == 0)); then
    return
  fi

  printf 'Dashboard cutover failed during %s; restoring the prior PM2/tunnel path.\n' \
    "$CURRENT_STAGE" >&2

  rm -f "$PLATFORM_VHOST"
  if [[ "$LEGACY_VHOST_REMOVED" == true ]]; then
    ln -s "$LEGACY_VHOST_TARGET" "$LEGACY_VHOST_LINK"
  fi
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 || true
  fi

  if [[ "$CHANGED" == true && -n "$BACKUP_DIR" ]]; then
    for config in "${CONFIGS[@]}"; do
      install -m 0644 -o root -g root "$BACKUP_DIR/$(basename "$config")" "$config"
    done
    for service in "${SERVICES[@]}"; do
      systemctl restart "$service" >/dev/null 2>&1 || true
    done
  fi

  if [[ "$PERSISTENCE_CHANGED" == true ]]; then
    if [[ "$WEB_WAS_ENABLED" == true ]]; then
      systemctl enable hellodeploy-web >/dev/null 2>&1 || true
    else
      systemctl disable hellodeploy-web >/dev/null 2>&1 || true
    fi
    if [[ "$WORKER_WAS_ENABLED" == true ]]; then
      systemctl enable hellodeploy-worker >/dev/null 2>&1 || true
    else
      systemctl disable hellodeploy-worker >/dev/null 2>&1 || true
    fi
  fi

  if ! verify_public_fallbacks || ! wait_for_url https://hellodeploy.online/health; then
    printf 'CRITICAL: dashboard rollback verification failed; keep the queue paused.\n' >&2
  fi
}
trap rollback EXIT

CURRENT_STAGE="candidate-recheck"
wait_for_response "http://127.0.0.1:$PORT/health" || fail "Candidate web health check failed before cutover."
if [[ "$RESPONSE_BODY" != *'"status":"ok"'* || "$RESPONSE_BODY" != *'"service":"web"'* ]]; then
  fail "Candidate web health response was unexpected before cutover."
fi
wait_for_response "http://127.0.0.1:$PORT/ready" || fail "Candidate web readiness check failed before cutover."
if [[ "$RESPONSE_BODY" != *'"status":"ready"'* ||
  "$RESPONSE_BODY" != *'"service":"web"'* ||
  "$RESPONSE_BODY" == *'false'* ]]; then
  fail "Candidate web readiness response was unexpected before cutover."
fi
check_worker_readiness
run_as_worker --check-queue-only

CURRENT_STAGE="legacy-vhost-disable"
if [[ -L "$LEGACY_VHOST_LINK" ]]; then
  rm -f "$LEGACY_VHOST_LINK"
  LEGACY_VHOST_REMOVED=true
fi

CURRENT_STAGE="platform-vhost-install"
bash "$HD_HOME/infrastructure/nginx/configure-platform-ingress.sh" "$HD_HOME/.env"
if [[ ! -f "$PLATFORM_VHOST" ]]; then
  fail "Platform Nginx vhost was not created."
fi

CURRENT_STAGE="backup"
install -d -m 0700 -o root -g root "$BACKUP_ROOT"
BACKUP_DIR=$(mktemp -d "$BACKUP_ROOT/p2-cutover.XXXXXX")
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
      if ((getline nextline) <= 0 || nextline != "    service: http://localhost:3001") {
        print "cutover target line has an unexpected shape" > "/dev/stderr"
        exit 44
      }
      print "    service: http://localhost:80"
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

CURRENT_STAGE="access-log-mark"
ACCESS_LOG_LINES_BEFORE=$(wc -l < /var/log/nginx/access.log 2>/dev/null || echo 0)

CURRENT_STAGE="public-verification"
wait_for_response "https://hellodeploy.online/health" || fail "Public dashboard health check did not converge after cutover."
if [[ "$RESPONSE_BODY" != *'"status":"ok"'* || "$RESPONSE_BODY" != *'"service":"web"'* ]]; then
  fail "Public dashboard health response was unexpected after cutover."
fi
wait_for_response "https://hellodeploy.online/ready" || fail "Public dashboard readiness check did not converge after cutover."
if [[ "$RESPONSE_BODY" != *'"status":"ready"'* ||
  "$RESPONSE_BODY" != *'"service":"web"'* ||
  "$RESPONSE_BODY" == *'false'* ]]; then
  fail "Public dashboard readiness response was unexpected after cutover."
fi

CURRENT_STAGE="session-cookie"
COOKIE_HEADERS=$(curl -sS --max-time 20 -D - -o /dev/null "https://hellodeploy.online/")
COOKIE_LINE=$(printf '%s' "$COOKIE_HEADERS" |
  grep -i '^set-cookie:.*hellodeploy\.sid=' | head -n 1 || true)
if [[ -z "$COOKIE_LINE" ]]; then
  fail "Public dashboard did not set the session cookie after cutover."
fi
COOKIE_LOWER=$(printf '%s' "$COOKIE_LINE" | tr '[:upper:]' '[:lower:]')
for attribute in secure httponly samesite=strict; do
  if [[ "$COOKIE_LOWER" != *"$attribute"* ]]; then
    fail "Public session cookie is missing required attribute: $attribute."
  fi
done

CURRENT_STAGE="nginx-path-proof"
ACCESS_LOG_LINES_AFTER=$(wc -l < /var/log/nginx/access.log 2>/dev/null || echo 0)
if (( ACCESS_LOG_LINES_AFTER <= ACCESS_LOG_LINES_BEFORE )); then
  fail "Nginx access log shows no new requests; traffic may still be bypassing Nginx."
fi

CURRENT_STAGE="fallback-verification"
verify_public_fallbacks

CURRENT_STAGE="queue-recheck"
run_as_worker --check-queue-only

CURRENT_STAGE="service-persistence"
PERSISTENCE_CHANGED=true
systemctl enable "${CANDIDATE_SERVICES[@]}"
for service in "${CANDIDATE_SERVICES[@]}"; do
  systemctl is-enabled --quiet "$service" || fail "Candidate service is not enabled after cutover: $service"
done

trap - EXIT
printf 'legacy_vhost=disabled\n'
printf 'dashboard_nginx_vhost=active\n'
printf 'tunnel_ingress=cutover\n'
printf 'dashboard_health=passed\n'
printf 'dashboard_ready=passed\n'
printf 'session_cookie=passed\n'
printf 'public_fallbacks=passed\n'
printf 'queue_state=paused\n'
printf 'candidate_services=enabled\n'
printf 'traffic_cutover=performed\n'
