#!/usr/bin/env bash
# Decrypt and verify a pilot backup without restoring or changing host state.
set -euo pipefail

error() { printf '[error] %s\n' "$*" >&2; }
info() { printf '[info] %s\n' "$*"; }

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" || $# -ne 1 || ! -f "$BACKUP_FILE" ]]; then
  error "Usage: bash infrastructure/verify-pilot-backup.sh <encrypted-backup.tar.gz.gpg>"
  exit 2
fi
if ! command -v gpg >/dev/null 2>&1; then
  error "GPG is required to verify the encrypted pilot backup."
  exit 1
fi

umask 077
VERIFY_DIR=$(mktemp -d "${TMPDIR:-/var/tmp}/hellodeploy-pilot-verify.XXXXXX")
cleanup() { rm -rf "$VERIFY_DIR"; }
trap cleanup EXIT INT TERM HUP

ARCHIVE_FILE="$VERIFY_DIR/pilot-backup.tar.gz"
gpg --batch --quiet --output "$ARCHIVE_FILE" --decrypt "$BACKUP_FILE"

# Accept only the exact files produced by backup-pilot.sh. Reject duplicate
# members and link/device types before extracting anything.
MEMBERS_FILE="$VERIFY_DIR/archive-members"
DETAILS_FILE="$VERIFY_DIR/archive-details"
tar -tzf "$ARCHIVE_FILE" > "$MEMBERS_FILE"
LC_ALL=C tar -tvzf "$ARCHIVE_FILE" --numeric-owner > "$DETAILS_FILE"
if ! awk '
  BEGIN {
    allowed["payload/"]=1
    allowed["payload/environment"]=1
    allowed["payload/dashboard-nginx.conf"]=1
    allowed["payload/tunnel.yml"]=1
    allowed["payload/tunnel-credentials"]=1
    allowed["payload/release-commit.txt"]=1
    allowed["payload/rollback-instructions"]=1
    allowed["payload/database-export.archive.gz"]=1
    allowed["payload/CHECKSUMS.sha256"]=1
    allowed["payload/manifest.json"]=1
    allowed["payload/hellodeploy-data.tar.gz"]=1
  }
  !allowed[$0] || seen[$0]++ { bad=1 }
  END {
    required["payload/"]=1
    required["payload/environment"]=1
    required["payload/dashboard-nginx.conf"]=1
    required["payload/tunnel.yml"]=1
    required["payload/tunnel-credentials"]=1
    required["payload/release-commit.txt"]=1
    required["payload/rollback-instructions"]=1
    required["payload/CHECKSUMS.sha256"]=1
    required["payload/manifest.json"]=1
    for (name in required) if (!seen[name]) bad=1
    exit bad ? 1 : 0
  }
' "$MEMBERS_FILE" || ! awk '$1 !~ /^[-d]/ { bad=1 } END { exit bad ? 1 : 0 }' "$DETAILS_FILE"; then
  error "The decrypted archive has an unexpected, duplicate, or unsafe member."
  exit 1
fi

tar --no-same-owner --no-same-permissions -xzf "$ARCHIVE_FILE" -C "$VERIFY_DIR"
if [[ ! -f "$VERIFY_DIR/payload/manifest.json" || ! -f "$VERIFY_DIR/payload/CHECKSUMS.sha256" ]]; then
  error "The decrypted backup is missing integrity metadata."
  exit 1
fi
(
  cd "$VERIFY_DIR/payload"
  if ! awk '
    BEGIN {
      allowed["environment"]=1
      allowed["dashboard-nginx.conf"]=1
      allowed["tunnel.yml"]=1
      allowed["tunnel-credentials"]=1
      allowed["release-commit.txt"]=1
      allowed["rollback-instructions"]=1
      allowed["database-export.archive.gz"]=1
      allowed["manifest.json"]=1
      allowed["hellodeploy-data.tar.gz"]=1
      required["environment"]=1
      required["dashboard-nginx.conf"]=1
      required["tunnel.yml"]=1
      required["tunnel-credentials"]=1
      required["release-commit.txt"]=1
      required["rollback-instructions"]=1
      required["manifest.json"]=1
    }
    !/^[0-9a-f]{64}  [^/]+$/ { bad=1; next }
    {
      name=substr($0, 67)
      if (!allowed[name] || seen[name]++) bad=1
    }
    END {
      for (name in required) if (!seen[name]) bad=1
      exit bad ? 1 : 0
    }
  ' CHECKSUMS.sha256; then
    error "The backup checksum inventory is unsafe."
    exit 1
  fi
  sha256sum --check --strict CHECKSUMS.sha256 >/dev/null
)

MANIFEST="$VERIFY_DIR/payload/manifest.json"
if ! grep -Eq '^  "formatVersion": 1,$' "$MANIFEST" ||
  ! grep -Eq '^  "kind": "hellodeploy-pilot-pre-cutover",$' "$MANIFEST" ||
  ! grep -Eq '^  "commitSha": "[0-9a-f]{40}",$' "$MANIFEST" ||
  ! grep -Eq '^  "databaseMode": "(verified-external-snapshot|verified-mongodump-export)",$' "$MANIFEST" ||
  ! grep -Eq '^  "dataIncluded": (true|false)$' "$MANIFEST"; then
  error "Pilot backup manifest is invalid."
  exit 1
fi

MANIFEST_COMMIT=$(sed -n 's/^  "commitSha": "\([0-9a-f]\{40\}\)",$/\1/p' "$MANIFEST")
RECORDED_COMMIT=$(tr -d '\r\n' < "$VERIFY_DIR/payload/release-commit.txt")
if [[ "$RECORDED_COMMIT" != "$MANIFEST_COMMIT" ]]; then
  error "Pilot backup release identity is inconsistent."
  exit 1
fi
if grep -q '^  "dataIncluded": true$' "$MANIFEST"; then
  [[ -f "$VERIFY_DIR/payload/hellodeploy-data.tar.gz" ]] || {
    error "Pilot backup data inventory is inconsistent."
    exit 1
  }
elif [[ -e "$VERIFY_DIR/payload/hellodeploy-data.tar.gz" ]]; then
  error "Pilot backup data inventory is inconsistent."
  exit 1
fi

if grep -q '^  "databaseMode": "verified-mongodump-export",$' "$MANIFEST"; then
  [[ -f "$VERIFY_DIR/payload/database-export.archive.gz" ]] || {
    error "Pilot backup database inventory is inconsistent."
    exit 1
  }
elif [[ -e "$VERIFY_DIR/payload/database-export.archive.gz" ]]; then
  error "Pilot backup database inventory is inconsistent."
  exit 1
fi

info "Encrypted pilot backup integrity verified."
