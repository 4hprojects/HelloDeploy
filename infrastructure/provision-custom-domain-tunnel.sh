#!/usr/bin/env bash
# Provision a per-domain Cloudflare tunnel connector for a verified custom domain.
#
# A tunnel's DNS route is a proxied CNAME to <tunnel-id>.cfargotunnel.com, and
# Cloudflare only accepts that record in a zone owned by the same account as the
# tunnel. `cloudflared tunnel login` and `tunnel create` therefore stay manual —
# they need the domain owner's credentials. This script takes the resulting
# tunnel id and performs every step after it.
#
# Usage:
#   sudo bash infrastructure/provision-custom-domain-tunnel.sh \
#     --hostname hellopera.online --tunnel-id 79fad542-... [--with-www]
#
#   --slug NAME             Override the connector name (default: first hostname label)
#   --credentials-file PATH Tunnel credentials JSON (default: <cred-dir>/<tunnel-id>.json)
#   --require-public        Treat an unreachable public hostname as a failure
#   --dry-run               Print the files that would be written, change nothing
set -euo pipefail

CRED_DIR="${HELLODEPLOY_TUNNEL_CREDENTIALS_DIR:-/home/henz/.cloudflared}"
BACKUP_ROOT="/var/lib/hellodeploy/tunnel-backups"

HOSTNAME_ARG=""
TUNNEL_ID=""
SLUG=""
CREDENTIALS_FILE=""
WITH_WWW=false
REQUIRE_PUBLIC=false
DRY_RUN=false

BACKUP_DIR=""
CURRENT_STAGE="preflight"
CREATED_CONFIG=false
CREATED_UNIT=false
CHANGED=false

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

usage() {
  sed -n '2,16p' "$0" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --hostname) HOSTNAME_ARG="${2:-}"; shift 2 ;;
    --tunnel-id) TUNNEL_ID="${2:-}"; shift 2 ;;
    --slug) SLUG="${2:-}"; shift 2 ;;
    --credentials-file) CREDENTIALS_FILE="${2:-}"; shift 2 ;;
    --with-www) WITH_WWW=true; shift ;;
    --require-public) REQUIRE_PUBLIC=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[[ -n "$HOSTNAME_ARG" ]] || usage
[[ -n "$TUNNEL_ID" ]] || usage

# Reject anything that would land unquoted in a config file or a unit name.
[[ "$HOSTNAME_ARG" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] ||
  fail "Hostname must be a lowercase FQDN without scheme or path: $HOSTNAME_ARG"
[[ "$TUNNEL_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] ||
  fail "Tunnel id must be a UUID: $TUNNEL_ID"

# The installed connectors are named after the first label (hellopera.yml,
# hellouniversity.yml), so default to that and keep this script idempotent
# against them. Two domains sharing a first label need an explicit --slug.
[[ -n "$SLUG" ]] || SLUG="${HOSTNAME_ARG%%.*}"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || fail "Slug must be lowercase alphanumeric with dashes: $SLUG"

[[ -n "$CREDENTIALS_FILE" ]] || CREDENTIALS_FILE="$CRED_DIR/$TUNNEL_ID.json"

CONFIG="/etc/cloudflared/$SLUG.yml"
UNIT="/etc/systemd/system/cloudflared-$SLUG.service"
SERVICE="cloudflared-$SLUG"
CNAME_TARGET="$TUNNEL_ID.cfargotunnel.com"

render_config() {
  printf 'tunnel: %s\ncredentials-file: %s\n\ningress:\n  - hostname: %s\n    service: http://localhost:80\n' \
    "$TUNNEL_ID" "$CREDENTIALS_FILE" "$HOSTNAME_ARG"
  if $WITH_WWW; then
    printf '\n  - hostname: www.%s\n    service: http://localhost:80\n' "$HOSTNAME_ARG"
  fi
  printf '\n  - service: http_status:404\n'
}

render_unit() {
  cat <<UNIT_EOF
[Unit]
Description=cloudflared tunnel for $HOSTNAME_ARG
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared --no-autoupdate --config $CONFIG tunnel run
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
UNIT_EOF
}

if $DRY_RUN; then
  printf '# %s\n' "$CONFIG"; render_config
  printf '\n# %s\n' "$UNIT"; render_unit
  printf '\n# DNS record the domain owner must create:\n#   CNAME %s -> %s (proxied)\n' \
    "$HOSTNAME_ARG" "$CNAME_TARGET"
  exit 0
fi

[[ $EUID -eq 0 ]] || fail "Run provisioning as root."
command -v cloudflared >/dev/null || fail "cloudflared is not installed."
[[ -f "$CREDENTIALS_FILE" ]] ||
  fail "Tunnel credentials not found: $CREDENTIALS_FILE — run 'cloudflared tunnel create' first."

# Idempotence: identical config and unit with a live connector means there is
# nothing to do, and restarting would drop traffic for no reason.
if [[ -f "$CONFIG" && -f "$UNIT" ]] &&
  diff -q <(render_config) "$CONFIG" >/dev/null 2>&1 &&
  diff -q <(render_unit) "$UNIT" >/dev/null 2>&1 &&
  systemctl is-active --quiet "$SERVICE"; then
  printf 'Already provisioned: %s via %s (no changes).\n' "$HOSTNAME_ARG" "$SERVICE"
  printf 'DNS record: CNAME %s -> %s (proxied)\n' "$HOSTNAME_ARG" "$CNAME_TARGET"
  exit 0
fi

rollback() {
  local status=$?
  ((status == 0)) && return
  printf 'Provisioning %s failed during %s; reverting.\n' "$HOSTNAME_ARG" "$CURRENT_STAGE" >&2
  if [[ "$CHANGED" == true ]]; then
    systemctl stop "$SERVICE" >/dev/null 2>&1 || true
    if $CREATED_CONFIG; then rm -f "$CONFIG"; elif [[ -n "$BACKUP_DIR" && -f "$BACKUP_DIR/config" ]]; then
      install -m 0644 -o root -g root "$BACKUP_DIR/config" "$CONFIG"
    fi
    if $CREATED_UNIT; then
      systemctl disable "$SERVICE" >/dev/null 2>&1 || true
      rm -f "$UNIT"
    elif [[ -n "$BACKUP_DIR" && -f "$BACKUP_DIR/unit" ]]; then
      install -m 0644 -o root -g root "$BACKUP_DIR/unit" "$UNIT"
    fi
    systemctl daemon-reload >/dev/null 2>&1 || true
    systemctl start "$SERVICE" >/dev/null 2>&1 || true
  fi
}
trap rollback EXIT

CURRENT_STAGE="backup"
install -d -m 0700 -o root -g root "$BACKUP_ROOT"
BACKUP_DIR=$(mktemp -d "$BACKUP_ROOT/$SLUG.XXXXXX")
chmod 0700 "$BACKUP_DIR"
[[ -f "$CONFIG" ]] && install -m 0600 -o root -g root "$CONFIG" "$BACKUP_DIR/config" || CREATED_CONFIG=true
[[ -f "$UNIT" ]] && install -m 0600 -o root -g root "$UNIT" "$BACKUP_DIR/unit" || CREATED_UNIT=true

CURRENT_STAGE="validate-candidate"
render_config > "$BACKUP_DIR/config.candidate"
# Validate before touching anything live — a malformed ingress must never reach
# a running connector.
cloudflared tunnel --config "$BACKUP_DIR/config.candidate" ingress validate >/dev/null ||
  fail "Generated ingress failed cloudflared validation."

CURRENT_STAGE="install"
CHANGED=true
install -m 0644 -o root -g root "$BACKUP_DIR/config.candidate" "$CONFIG"
render_unit > "$BACKUP_DIR/unit.candidate"
install -m 0644 -o root -g root "$BACKUP_DIR/unit.candidate" "$UNIT"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null

CURRENT_STAGE="restart"
# `enable --now` does not reload an already-running connector, which silently
# leaves the previous config in memory. Always restart explicitly.
systemctl restart "$SERVICE"

CURRENT_STAGE="connector-health"
connected=false
for _ in $(seq 1 30); do
  if systemctl is-active --quiet "$SERVICE" &&
    journalctl -u "$SERVICE" --since "-2 min" --no-pager 2>/dev/null |
      grep -q "Registered tunnel connection"; then
    connected=true
    break
  fi
  sleep 2
done
$connected || fail "Connector did not register a tunnel connection; see: journalctl -u $SERVICE"

CURRENT_STAGE="public-probe"
public_ok=false
for _ in $(seq 1 10); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$HOSTNAME_ARG/" 2>/dev/null || echo 000)
  if [[ "$code" =~ ^(2|3)[0-9][0-9]$ ]]; then
    public_ok=true
    break
  fi
  sleep 3
done

trap - EXIT
printf '\nConnector active: %s -> %s\n' "$HOSTNAME_ARG" "$SERVICE"
if $public_ok; then
  printf 'Public check: https://%s responds (HTTP %s).\n' "$HOSTNAME_ARG" "$code"
else
  printf 'Public check: https://%s did not respond (last HTTP %s).\n' "$HOSTNAME_ARG" "$code"
  printf 'The connector is healthy, so DNS is the remaining step. The domain owner must add:\n'
  printf '  CNAME %s -> %s   (proxied)\n' "$HOSTNAME_ARG" "$CNAME_TARGET"
  $REQUIRE_PUBLIC && fail "--require-public was set and the hostname is unreachable."
fi
