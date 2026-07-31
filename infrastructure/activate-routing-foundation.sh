#!/usr/bin/env bash
# Activate and prove the constrained Nginx helper while the deployment queue is paused.
set -euo pipefail

EXPECTED_COMMIT="${HELLODEPLOY_EXPECTED_RELEASE_COMMIT:-}"
HD_HOME="/opt/hellodeploy"
INCLUDE_FILE="/etc/nginx/conf.d/hellodeploy.conf"
PROBE_FILE="/etc/nginx/hellodeploy.d/zz-hd-p2-routing-probe.conf"
INCLUDE_CONTENT='include /etc/nginx/hellodeploy.d/*.conf;'
INCLUDE_CREATED=false
HELPER_STARTED=false
TEMP_INCLUDE=""

if [[ $EUID -ne 0 ]]; then
  printf 'Run routing-foundation activation as root.\n' >&2
  exit 1
fi
if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'HELLODEPLOY_EXPECTED_RELEASE_COMMIT must be a full commit.\n' >&2
  exit 1
fi
if [[ "$(git -C "$HD_HOME" rev-parse --verify HEAD^{commit} 2>/dev/null || true)" != "$EXPECTED_COMMIT" ]] ||
  [[ -n "$(git -C "$HD_HOME" status --porcelain 2>/dev/null || true)" ]]; then
  printf 'Installed release is missing, dirty, or does not match the expected commit.\n' >&2
  exit 1
fi
if systemctl is-active --quiet hellodeploy-worker; then
  printf 'Deployment worker must remain inactive during routing-foundation activation.\n' >&2
  exit 1
fi
if systemctl is-active --quiet hellodeploy-nginx-helper ||
  systemctl is-enabled --quiet hellodeploy-nginx-helper; then
  printf 'Nginx helper must be inactive and disabled before controlled activation.\n' >&2
  exit 1
fi
if [[ -e "$PROBE_FILE" ]]; then
  printf 'Routing probe file already exists; refusing to overwrite it.\n' >&2
  exit 1
fi
if ss -H -ltn 'sport = :18080' 2>/dev/null | grep -q .; then
  printf 'Routing probe port is already in use.\n' >&2
  exit 1
fi

run_as_worker() {
  (
    cd "$HD_HOME"
    runuser -u hellodeploy-worker -- \
      env NODE_ENV=production \
      /usr/bin/node scripts/verify-nginx-helper-live.js "$@"
  )
}

rollback() {
  local status=$?
  if ((status == 0)); then
    return
  fi

  printf 'Routing-foundation activation failed; restoring inactive state.\n' >&2
  [[ -n "$TEMP_INCLUDE" ]] && rm -f "$TEMP_INCLUDE"
  rm -f "$PROBE_FILE" "$PROBE_FILE.tmp" "$PROBE_FILE.bak"
  if [[ "$HELPER_STARTED" == true ]]; then
    systemctl disable --now hellodeploy-nginx-helper >/dev/null 2>&1 || true
  fi
  if [[ "$INCLUDE_CREATED" == true ]]; then
    rm -f "$INCLUDE_FILE"
  fi
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 || true
  else
    printf 'CRITICAL: Nginx rollback validation failed; keep the queue paused.\n' >&2
  fi
}
trap rollback EXIT

run_as_worker --check-queue-only

if [[ -f "$INCLUDE_FILE" ]]; then
  if [[ "$(tr -d '\r\n' <"$INCLUDE_FILE")" != "$INCLUDE_CONTENT" ]]; then
    printf 'Existing HelloDeploy Nginx include differs from the reviewed content.\n' >&2
    exit 1
  fi
else
  TEMP_INCLUDE=$(mktemp)
  printf '%s\n' "$INCLUDE_CONTENT" >"$TEMP_INCLUDE"
  install -m 0644 -o root -g root "$TEMP_INCLUDE" "$INCLUDE_FILE"
  INCLUDE_CREATED=true
  rm -f "$TEMP_INCLUDE"
  TEMP_INCLUDE=""
fi

nginx -t
systemctl reload nginx
HELPER_STARTED=true
systemctl enable --now hellodeploy-nginx-helper

for _ in $(seq 1 50); do
  [[ -S /run/hellodeploy/nginx-helper.sock ]] && break
  sleep 0.1
done
if [[ ! -S /run/hellodeploy/nginx-helper.sock ]]; then
  printf 'Nginx helper socket did not become ready.\n' >&2
  exit 1
fi

run_as_worker

if systemctl is-active --quiet hellodeploy-worker; then
  printf 'Deployment worker activated unexpectedly.\n' >&2
  exit 1
fi
if [[ -e "$PROBE_FILE" ]]; then
  printf 'Routing probe file remained after verification.\n' >&2
  exit 1
fi

trap - EXIT
printf 'routing_foundation=passed\n'
printf 'helper_persistent=active-enabled\n'
printf 'worker_state=inactive\n'
printf 'queue_state=paused\n'
