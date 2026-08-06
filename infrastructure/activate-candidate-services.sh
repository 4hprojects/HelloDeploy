#!/usr/bin/env bash
# Start and verify candidate hellodeploy-web/hellodeploy-worker services without
# cutting over live dashboard traffic, enabling boot persistence, or resuming the
# deployment queue.
set -euo pipefail

EXPECTED_COMMIT="${HELLODEPLOY_EXPECTED_RELEASE_COMMIT:-}"
HD_HOME="/opt/hellodeploy"
ENV_FILE="$HD_HOME/.env"
WEB_STARTED=false
WORKER_STARTED=false
CURRENT_STAGE="preflight"
RESPONSE_BODY=""

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "Run candidate service activation as root."
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  fail "HELLODEPLOY_EXPECTED_RELEASE_COMMIT must be a full commit."
fi
if [[ "$(git -C "$HD_HOME" rev-parse --verify HEAD^{commit} 2>/dev/null || true)" != "$EXPECTED_COMMIT" ]] ||
  [[ -n "$(git -C "$HD_HOME" status --porcelain 2>/dev/null || true)" ]]; then
  fail "Installed release is missing, dirty, or does not match the expected commit."
fi
if ! systemctl is-active --quiet hellodeploy-nginx-helper; then
  fail "Nginx helper must be active before candidate service activation."
fi
if systemctl is-active --quiet hellodeploy-web; then
  fail "Candidate web service is already active; refusing an ambiguous retry."
fi
if systemctl is-active --quiet hellodeploy-worker; then
  fail "Candidate worker service is already active; refusing an ambiguous retry."
fi
if nginx -t >/dev/null 2>&1; then
  :
else
  fail "Existing Nginx configuration is invalid."
fi

if [[ -f "$ENV_FILE" ]]; then
  PORT=$(awk -F= '$1 == "PORT" {value=$2; gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", value); print value; exit}' "$ENV_FILE")
else
  PORT=""
fi
if [[ ! "$PORT" =~ ^[0-9]+$ || "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  fail "Candidate web port is invalid."
fi
if ss -H -ltn "sport = :$PORT" 2>/dev/null | grep -q .; then
  fail "Candidate web port is already in use."
fi

if ! (cd "$HD_HOME" && runuser -u hellodeploy-web -- node scripts/validate-config.js --component web --require-production >/dev/null 2>&1); then
  fail "Web production configuration is invalid."
fi
if ! (cd "$HD_HOME" && runuser -u hellodeploy-worker -- node scripts/validate-config.js --component worker --require-production >/dev/null 2>&1); then
  fail "Worker production configuration is invalid."
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

rollback() {
  local status=$?
  if ((status == 0)); then
    return
  fi

  printf 'Candidate service activation failed during %s; stopping candidate services.\n' \
    "$CURRENT_STAGE" >&2
  if [[ "$WORKER_STARTED" == true ]]; then
    systemctl stop hellodeploy-worker >/dev/null 2>&1 || true
  fi
  if [[ "$WEB_STARTED" == true ]]; then
    systemctl stop hellodeploy-web >/dev/null 2>&1 || true
  fi
  if systemctl is-active --quiet hellodeploy-web || systemctl is-active --quiet hellodeploy-worker; then
    printf 'CRITICAL: candidate service rollback failed; a candidate service remains active.\n' >&2
  fi
}
trap rollback EXIT

CURRENT_STAGE="queue-precheck"
run_as_worker --check-queue-only

CURRENT_STAGE="web-start"
systemctl start hellodeploy-web
WEB_STARTED=true

CURRENT_STAGE="worker-start"
systemctl start hellodeploy-worker
WORKER_STARTED=true

CURRENT_STAGE="web-health"
wait_for_response "http://127.0.0.1:$PORT/health" || fail "Candidate web health check did not converge."
if [[ "$RESPONSE_BODY" != *'"status":"ok"'* || "$RESPONSE_BODY" != *'"service":"web"'* ]]; then
  fail "Candidate web health response was unexpected."
fi

CURRENT_STAGE="web-ready"
wait_for_response "http://127.0.0.1:$PORT/ready" || fail "Candidate web readiness check did not converge."
if [[ "$RESPONSE_BODY" != *'"status":"ready"'* ||
  "$RESPONSE_BODY" != *'"service":"web"'* ||
  "$RESPONSE_BODY" == *'false'* ]]; then
  fail "Candidate web readiness response was unexpected."
fi

CURRENT_STAGE="session-cookie"
# The first request into a fresh sessions collection can take longer than a warm
# request (index creation, connection-pool warm-up), bounded by connectDatabase's
# own serverSelectionTimeoutMS/socketTimeoutMS — 20s gives that room without
# masking a genuine hang.
COOKIE_HEADERS=$(curl -sS --max-time 20 -D - -o /dev/null \
  -H "X-Forwarded-Proto: https" "http://127.0.0.1:$PORT/")
COOKIE_LINE=$(printf '%s' "$COOKIE_HEADERS" |
  grep -i '^set-cookie:.*hellodeploy\.sid=' | head -n 1 || true)
if [[ -z "$COOKIE_LINE" ]]; then
  fail "Candidate web did not set the session cookie."
fi
COOKIE_LOWER=$(printf '%s' "$COOKIE_LINE" | tr '[:upper:]' '[:lower:]')
for attribute in secure httponly samesite=strict; do
  if [[ "$COOKIE_LOWER" != *"$attribute"* ]]; then
    fail "Candidate session cookie is missing required attribute: $attribute."
  fi
done

CURRENT_STAGE="worker-ready"
check_worker_readiness

CURRENT_STAGE="queue-recheck"
run_as_worker --check-queue-only

trap - EXIT
printf 'web_state=active-candidate\n'
printf 'worker_state=active-candidate\n'
printf 'web_health=passed\n'
printf 'web_ready=passed\n'
printf 'session_cookie=passed\n'
printf 'worker_ready=passed\n'
printf 'queue_state=paused\n'
printf 'nginx_syntax=passed\n'
printf 'traffic_cutover=not-performed\n'
