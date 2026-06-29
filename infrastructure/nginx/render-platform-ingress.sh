#!/usr/bin/env bash
# Render and activate the HelloDeploy platform UI ingress from an env file.
set -euo pipefail

ENV_FILE="${1:-.env}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/hellodeploy-platform.conf.template"
OUTPUT="/etc/nginx/conf.d/hellodeploy-platform.conf"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

PLATFORM_DOMAIN="$(awk -F= '$1 == "PLATFORM_DOMAIN" { print substr($0, index($0, "=") + 1); exit }' "$ENV_FILE")"
WEB_PORT="$(awk -F= '$1 == "PORT" { print substr($0, index($0, "=") + 1); exit }' "$ENV_FILE")"

if [[ ! "$PLATFORM_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Invalid PLATFORM_DOMAIN for Nginx: $PLATFORM_DOMAIN" >&2
  exit 1
fi
if [[ ! "$WEB_PORT" =~ ^[0-9]+$ ]] || (( WEB_PORT < 1 || WEB_PORT > 65535 )); then
  echo "Invalid PORT for Nginx: $WEB_PORT" >&2
  exit 1
fi

sed \
  -e "s/{{PLATFORM_DOMAIN}}/$PLATFORM_DOMAIN/g" \
  -e "s/{{PORT}}/$WEB_PORT/g" \
  "$TEMPLATE" > "$OUTPUT"

nginx -t
systemctl reload nginx
