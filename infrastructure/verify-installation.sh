#!/usr/bin/env bash
# Verify security-sensitive invariants after install, upgrade, or restore.
set -euo pipefail

HD_HOME="${HD_HOME:-/opt/hellodeploy}"
ENV_FILE="$HD_HOME/.env"
HELPER_SOCKET="${NGINX_HELPER_SOCKET:-/run/hellodeploy/nginx-helper.sock}"
ROUTE_DIR="${NGINX_HELLODEPLOY_CONFIG_DIR:-/etc/nginx/hellodeploy.d}"
VERIFY_ROLE="${HELLODEPLOY_VERIFY_ROLE:-full}"
FAILED=0

pass() { echo "[pass] $*"; }
fail() { echo "[fail] $*" >&2; FAILED=$((FAILED + 1)); }

if [[ $EUID -ne 0 ]]; then
  echo "Run this verification as root." >&2
  exit 1
fi
if [[ "$VERIFY_ROLE" != "full" && "$VERIFY_ROLE" != "worker" ]]; then
  echo "HELLODEPLOY_VERIFY_ROLE must be full or worker." >&2
  exit 1
fi

check_user() {
  local user="$1"
  if id "$user" >/dev/null 2>&1; then pass "user exists: $user"; else fail "missing user: $user"; fi
}

check_user hellodeploy-worker

WORKER_GROUPS=$(id -nG hellodeploy-worker 2>/dev/null || true)
if id hellodeploy-web >/dev/null 2>&1; then
  WEB_GROUPS=$(id -nG hellodeploy-web 2>/dev/null || true)
  if [[ " $WEB_GROUPS " == *" docker "* || " $WEB_GROUPS " == *" hellodeploy-nginx "* ]]; then
    fail "web user has Docker or Nginx-helper group access"
  else
    pass "web user is isolated from Docker and Nginx helper groups"
  fi
elif [[ "$VERIFY_ROLE" == "full" ]]; then
  fail "missing user: hellodeploy-web"
else
  pass "web user is absent from the worker-only host"
fi
for group in docker hellodeploy-nginx; do
  if [[ " $WORKER_GROUPS " == *" $group "* ]]; then
    pass "worker belongs to $group"
  else
    fail "worker is missing group: $group"
  fi
done

check_metadata() {
  local path="$1" expected="$2" label="$3"
  if [[ ! -e "$path" ]]; then fail "$label is missing: $path"; return; fi
  local actual
  actual=$(stat -c '%U:%G:%a' "$path")
  if [[ "$actual" == "$expected" ]]; then pass "$label metadata is $actual"; else fail "$label metadata is $actual; expected $expected"; fi
}

check_metadata "$ENV_FILE" "root:hellodeploy-config:640" ".env"
check_metadata "$ROUTE_DIR" "root:root:755" "Nginx route directory"
check_metadata "$HELPER_SOCKET" "root:hellodeploy-nginx:660" "Nginx helper socket"

if [[ -f "$ENV_FILE" ]]; then
  PRIVATE_KEY_PATH=$(awk -F= '$1 == "GITHUB_APP_PRIVATE_KEY_PATH" {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE")
  if [[ -n "$PRIVATE_KEY_PATH" ]]; then
    if runuser -u hellodeploy-worker -- test -r "$PRIVATE_KEY_PATH"; then pass "worker can read GitHub private key"; else fail "worker cannot read GitHub private key"; fi
    if [[ "$VERIFY_ROLE" == "full" ]]; then
      if runuser -u hellodeploy-web -- test -r "$PRIVATE_KEY_PATH"; then
        pass "web can read GitHub private key (required by current GitHub App signing flow)"
      else
        fail "web cannot read GitHub private key required by current signing flow"
      fi
    fi
  fi
fi

SERVICES=(hellodeploy-nginx-helper hellodeploy-worker)
if [[ "$VERIFY_ROLE" == "full" ]]; then
  SERVICES+=(hellodeploy-web)
elif systemctl is-active --quiet hellodeploy-web; then
  fail "web service must not run on a worker-only host"
else
  pass "web service is inactive on the worker-only host"
fi
for service in "${SERVICES[@]}"; do
  if systemctl is-active --quiet "$service"; then pass "service active: $service"; else fail "service inactive: $service"; fi
done

if nginx -t >/dev/null 2>&1; then pass "nginx configuration valid"; else fail "nginx -t failed"; fi

if [[ "$VERIFY_ROLE" == "full" ]]; then
  PORT=$(awk -F= '$1 == "PORT" {print $2; exit}' "$ENV_FILE" 2>/dev/null || true)
  PORT="${PORT:-3000}"
  if curl --fail --silent --show-error "http://127.0.0.1:${PORT}/ready" >/dev/null; then
    pass "web readiness endpoint is healthy"
  else
    fail "web readiness endpoint is unhealthy"
  fi
elif (cd "$HD_HOME" && runuser -u hellodeploy-worker -- node scripts/validate-config.js --component worker --require-production >/dev/null); then
  pass "worker production configuration is valid"
else
  fail "worker production configuration is invalid"
fi

if (( FAILED > 0 )); then
  echo "$FAILED installation verification check(s) failed." >&2
  exit 1
fi
echo "All installation verification checks passed."
