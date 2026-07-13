#!/usr/bin/env bash
# Capture the existing repository-run pilot before in-place productionization.
#
# The resulting artifact is encrypted to an existing GPG recipient. Plaintext
# staging is created with mode 0700 and removed on every exit path. This script
# does not stop services, change routes, or modify the source checkout.
set -euo pipefail

REPO_DIR=""
OUTPUT_FILE=""
GPG_RECIPIENT=""
NGINX_CONFIG=""
TUNNEL_CONFIG="/etc/cloudflared/hellodeploy.yml"
DATA_DIR=""
ROLLBACK_INSTRUCTIONS=""
DATABASE_SNAPSHOT_CONFIRMED=false

error() { printf '[error] %s\n' "$*" >&2; }
info() { printf '[info] %s\n' "$*"; }

usage() {
  cat <<'EOF'
Usage: sudo bash infrastructure/backup-pilot.sh \
  --repo /path/to/HelloDeploy \
  --output /protected/off-host-staging/hellodeploy-pilot.tar.gz.gpg \
  --gpg-recipient RECIPIENT_FINGERPRINT \
  --nginx-config /path/to/active-dashboard.conf \
  --rollback-instructions /root/private/pilot-rollback.txt \
  --external-database-snapshot-confirmed \
  [--tunnel-config /etc/cloudflared/hellodeploy.yml] \
  [--data-dir /path/to/existing/hellodeploy-data]

The output location must be outside the source repository. This command creates
an encrypted artifact; store it on the approved off-host medium, retrieve it,
and verify it before changing the pilot. Verification on this host proves
artifact integrity, not cross-host restore readiness.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_DIR="${2:-}"; shift 2 ;;
    --output) OUTPUT_FILE="${2:-}"; shift 2 ;;
    --gpg-recipient) GPG_RECIPIENT="${2:-}"; shift 2 ;;
    --nginx-config) NGINX_CONFIG="${2:-}"; shift 2 ;;
    --tunnel-config) TUNNEL_CONFIG="${2:-}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:-}"; shift 2 ;;
    --rollback-instructions) ROLLBACK_INSTRUCTIONS="${2:-}"; shift 2 ;;
    --external-database-snapshot-confirmed) DATABASE_SNAPSHOT_CONFIRMED=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) error "Unknown or incomplete argument."; usage >&2; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  error "Run this backup as root."
  exit 1
fi

if [[ -z "$REPO_DIR" || -z "$OUTPUT_FILE" || -z "$GPG_RECIPIENT" || -z "$NGINX_CONFIG" || -z "$ROLLBACK_INSTRUCTIONS" ]]; then
  error "Repository, output, GPG recipient, Nginx configuration, and rollback instructions are required."
  usage >&2
  exit 2
fi
if [[ "$DATABASE_SNAPSHOT_CONFIRMED" != true ]]; then
  error "Confirm a current external database snapshot before capturing the pilot backup."
  exit 1
fi
if ! command -v gpg >/dev/null 2>&1; then
  error "GPG is required to create an encrypted pilot backup."
  exit 1
fi

REPO_DIR=$(realpath -e "$REPO_DIR")
NGINX_CONFIG=$(realpath -e "$NGINX_CONFIG")
TUNNEL_CONFIG=$(realpath -e "$TUNNEL_CONFIG")
ROLLBACK_INSTRUCTIONS=$(realpath -e "$ROLLBACK_INSTRUCTIONS")

OUTPUT_PARENT=$(dirname "$OUTPUT_FILE")
if [[ ! -d "$OUTPUT_PARENT" ]]; then
  error "The protected output directory must already exist."
  exit 1
fi
OUTPUT_PARENT=$(realpath -e "$OUTPUT_PARENT")
OUTPUT_FILE="$OUTPUT_PARENT/$(basename "$OUTPUT_FILE")"
OUTPUT_MODE=$(stat -c '%a' "$OUTPUT_PARENT")
OUTPUT_OWNER=$(stat -c '%u' "$OUTPUT_PARENT")
if [[ "$OUTPUT_OWNER" != 0 ]]; then
  error "The protected output directory must be owned by root."
  exit 1
fi
if [[ ! "$OUTPUT_MODE" =~ ^[0-7]*00$ ]]; then
  error "The protected output directory must deny group and other access."
  exit 1
fi

if [[ ! -d "$REPO_DIR/.git" || ! -f "$REPO_DIR/.env" ]]; then
  error "The repository must be a Git checkout with an existing .env file."
  exit 1
fi
if [[ ! -f "$NGINX_CONFIG" || ! -f "$TUNNEL_CONFIG" ]]; then
  error "The active Nginx and tunnel configuration files must exist."
  exit 1
fi
ROLLBACK_OWNER=$(stat -c '%u' "$ROLLBACK_INSTRUCTIONS")
ROLLBACK_MODE=$(stat -c '%a' "$ROLLBACK_INSTRUCTIONS")
if [[ ! -f "$ROLLBACK_INSTRUCTIONS" || "$ROLLBACK_OWNER" != 0 || ! "$ROLLBACK_MODE" =~ ^[0-7]*00$ ]]; then
  error "Rollback instructions must be a root-owned private regular file."
  exit 1
fi
if [[ "$OUTPUT_FILE" == "$REPO_DIR"/* ]]; then
  error "The encrypted output must be outside the source repository."
  exit 1
fi
if [[ -e "$OUTPUT_FILE" ]]; then
  error "Refusing to overwrite an existing backup artifact."
  exit 1
fi
if [[ -n "$(git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" status --porcelain --untracked-files=normal)" ]]; then
  error "The pilot repository is not clean; record or preserve its exact state first."
  exit 1
fi

COMMIT_SHA=$(git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" rev-parse --verify HEAD^{commit})
if [[ ! "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  error "Unable to resolve the pilot release to a full commit."
  exit 1
fi
if [[ ! "$GPG_RECIPIENT" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  error "The GPG recipient must be an exact 40-character fingerprint."
  exit 1
fi
if ! gpg --batch --list-keys -- "$GPG_RECIPIENT" >/dev/null 2>&1; then
  error "The requested GPG recipient is not available in the root keyring."
  exit 1
fi

# The tunnel credential path is secret-bearing state. Parse only the path,
# require an absolute regular file, and never print it.
TUNNEL_CREDENTIAL=$(awk '
  /^[[:space:]]*credentials-file:[[:space:]]*/ {
    sub(/^[^:]*:[[:space:]]*/, ""); gsub(/^"|"$/, ""); print; exit
  }
' "$TUNNEL_CONFIG")
if [[ -z "$TUNNEL_CREDENTIAL" || "$TUNNEL_CREDENTIAL" != /* || ! -f "$TUNNEL_CREDENTIAL" ]]; then
  error "Tunnel configuration must reference an existing absolute credentials file."
  exit 1
fi
TUNNEL_CREDENTIAL=$(realpath -e "$TUNNEL_CREDENTIAL")

if [[ -n "$DATA_DIR" ]]; then
  DATA_DIR=$(realpath -e "$DATA_DIR")
  if [[ ! -d "$DATA_DIR" ]]; then
    error "The requested data directory does not exist."
    exit 1
  fi
fi

umask 077
STAGING_DIR=$(mktemp -d "${TMPDIR:-/var/tmp}/hellodeploy-pilot-backup.XXXXXX")
ARCHIVE_FILE="$STAGING_DIR/pilot-backup.tar.gz"
OUTPUT_TEMP="$OUTPUT_FILE.partial"
cleanup() {
  rm -rf "$STAGING_DIR"
  rm -f "$OUTPUT_TEMP"
}
trap cleanup EXIT INT TERM HUP

mkdir -m 0700 "$STAGING_DIR/payload"
install -m 0600 "$REPO_DIR/.env" "$STAGING_DIR/payload/environment"
install -m 0600 "$NGINX_CONFIG" "$STAGING_DIR/payload/dashboard-nginx.conf"
install -m 0600 "$TUNNEL_CONFIG" "$STAGING_DIR/payload/tunnel.yml"
install -m 0600 "$TUNNEL_CREDENTIAL" "$STAGING_DIR/payload/tunnel-credentials"
install -m 0600 "$ROLLBACK_INSTRUCTIONS" "$STAGING_DIR/payload/rollback-instructions"

if [[ -n "$DATA_DIR" ]]; then
  tar -czf "$STAGING_DIR/payload/hellodeploy-data.tar.gz" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
fi

printf '%s\n' "$COMMIT_SHA" > "$STAGING_DIR/payload/release-commit.txt"
(
  cd "$STAGING_DIR/payload"
  find . -type f ! -name CHECKSUMS.sha256 -printf '%P\n' | LC_ALL=C sort | xargs -r sha256sum > CHECKSUMS.sha256
)

CREATED_AT=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
DATA_INCLUDED=false
[[ -n "$DATA_DIR" ]] && DATA_INCLUDED=true
cat > "$STAGING_DIR/payload/manifest.json" <<EOF
{
  "formatVersion": 1,
  "kind": "hellodeploy-pilot-pre-cutover",
  "createdAt": "$CREATED_AT",
  "commitSha": "$COMMIT_SHA",
  "databaseMode": "verified-external-snapshot",
  "dataIncluded": $DATA_INCLUDED
}
EOF
(
  cd "$STAGING_DIR/payload"
  sha256sum manifest.json >> CHECKSUMS.sha256
  sha256sum --check --strict CHECKSUMS.sha256 >/dev/null
)

tar -czf "$ARCHIVE_FILE" -C "$STAGING_DIR" payload
gpg --batch --yes --trust-model always --recipient "$GPG_RECIPIENT" \
  --output "$OUTPUT_TEMP" --encrypt "$ARCHIVE_FILE"
gpg --batch --list-packets "$OUTPUT_TEMP" >/dev/null 2>&1
chmod 600 "$OUTPUT_TEMP"
mv "$OUTPUT_TEMP" "$OUTPUT_FILE"

info "Encrypted pilot backup created."
info "Store the artifact off-host, retrieve it, and run verify-pilot-backup.sh before any host mutation."
info "Same-host verification does not satisfy the cross-host restore gate."
