#!/usr/bin/env bash
# Verify an inactive in-place HelloDeploy foundation without starting services
# or changing Nginx, tunnel, queue, process, or traffic state.
set -euo pipefail

HD_HOME="${HD_HOME:-/opt/hellodeploy}"
EXPECTED_COMMIT="${HELLODEPLOY_EXPECTED_RELEASE_COMMIT:-}"
ENV_FILE="$HD_HOME/.env"
FAILED=0

pass() { printf '[pass] %s\n' "$*"; }
fail() { printf '[fail] %s\n' "$*" >&2; FAILED=$((FAILED + 1)); }

if [[ $EUID -ne 0 ]]; then
  printf 'Run prepared-installation verification as root.\n' >&2
  exit 1
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'HELLODEPLOY_EXPECTED_RELEASE_COMMIT must be a full 40-character commit.\n' >&2
  exit 1
fi

if [[ -d "$HD_HOME/.git" ]] &&
  [[ "$(git -C "$HD_HOME" rev-parse --verify HEAD^{commit} 2>/dev/null || true)" == "$EXPECTED_COMMIT" ]] &&
  [[ -z "$(git -C "$HD_HOME" status --porcelain --untracked-files=normal 2>/dev/null || true)" ]]; then
  pass "immutable release checkout matches and is clean"
else
  fail "immutable release checkout is missing, unexpected, or dirty"
fi

for user in hellodeploy-web hellodeploy-worker; do
  if id "$user" >/dev/null 2>&1; then pass "service identity exists: $user"; else fail "service identity missing: $user"; fi
done

WEB_GROUPS=$(id -nG hellodeploy-web 2>/dev/null || true)
WORKER_GROUPS=$(id -nG hellodeploy-worker 2>/dev/null || true)
if [[ " $WEB_GROUPS " == *" docker "* || " $WEB_GROUPS " == *" hellodeploy-nginx "* ]]; then
  fail "web identity has privileged deployment-plane group access"
else
  pass "web identity is excluded from privileged deployment-plane groups"
fi
for group in docker hellodeploy-nginx hellodeploy-config; do
  if [[ " $WORKER_GROUPS " == *" $group "* ]]; then pass "worker has required group: $group"; else fail "worker missing required group: $group"; fi
done

if [[ -f "$ENV_FILE" && "$(stat -c '%U:%G:%a' "$ENV_FILE")" == "root:hellodeploy-config:640" ]]; then
  pass "installed configuration ownership and mode are protected"
else
  fail "installed configuration ownership or mode is unsafe"
fi
if [[ -d /etc/nginx/hellodeploy.d && "$(stat -c '%U:%G:%a' /etc/nginx/hellodeploy.d)" == "root:root:755" ]]; then
  pass "managed route directory ownership and mode are correct"
else
  fail "managed route directory ownership or mode is unsafe"
fi

if command -v docker >/dev/null 2>&1 && systemctl is-active --quiet docker; then
  pass "Docker is installed and active"
else
  fail "Docker is unavailable or inactive"
fi
if runuser -u hellodeploy-worker -- docker info >/dev/null 2>&1; then
  pass "worker identity can access Docker"
else
  fail "worker identity cannot access Docker"
fi
if runuser -u hellodeploy-web -- docker info >/dev/null 2>&1; then
  fail "web identity can access Docker"
else
  pass "web identity is denied Docker access"
fi

for unit in hellodeploy-web hellodeploy-worker hellodeploy-nginx-helper; do
  if [[ -f "/etc/systemd/system/$unit.service" ]]; then pass "unit file installed: $unit"; else fail "unit file missing: $unit"; fi
  if systemctl is-active --quiet "$unit" 2>/dev/null || systemctl is-enabled --quiet "$unit" 2>/dev/null; then
    fail "prepared unit is active or enabled: $unit"
  else
    pass "prepared unit remains inactive and disabled: $unit"
  fi
done

if [[ -e /run/hellodeploy/nginx-helper.sock ]]; then
  fail "Nginx helper socket exists before activation"
else
  pass "Nginx helper socket is absent before activation"
fi
if nginx -t >/dev/null 2>&1; then pass "existing Nginx configuration is valid"; else fail "existing Nginx configuration is invalid"; fi

if [[ -f "$ENV_FILE" ]]; then
  PORT=$(awk -F= '$1 == "PORT" {value=$2; gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", value); print value; exit}' "$ENV_FILE")
else
  PORT=""
fi
if [[ ! "$PORT" =~ ^[0-9]+$ || "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  fail "candidate web port is invalid"
elif ! command -v ss >/dev/null 2>&1; then
  fail "socket inspection command is unavailable"
elif ss -H -ltn "sport = :$PORT" 2>/dev/null | grep -q .; then
  fail "candidate web port is already in use"
else
  pass "candidate web port is available"
fi

if (cd "$HD_HOME" && runuser -u hellodeploy-web -- node scripts/validate-config.js --component web --require-production >/dev/null 2>&1); then
  pass "web production configuration is valid"
else
  fail "web production configuration is invalid"
fi
if (cd "$HD_HOME" && runuser -u hellodeploy-worker -- node scripts/validate-config.js --component worker --require-production >/dev/null 2>&1); then
  pass "worker production configuration is valid"
else
  fail "worker production configuration is invalid"
fi

if (( FAILED > 0 )); then
  printf 'Prepared installation verification failed with %d issue(s).\n' "$FAILED" >&2
  exit 1
fi
printf 'Prepared installation verification passed; services and ingress remain inactive.\n'
