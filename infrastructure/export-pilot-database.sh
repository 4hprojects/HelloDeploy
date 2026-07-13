#!/usr/bin/env bash
# Create and non-destructively verify a compressed MongoDB export for the
# pre-cutover pilot backup. Sensitive connection state is loaded from an
# existing environment file and never placed in process arguments or output.
set -Eeuo pipefail

ENV_FILE=""
OUTPUT_FILE=""
TOOLS_DIR=""

error() { printf '[error] %s\n' "$*" >&2; }
info() { printf '[info] %s\n' "$*"; }

require_root_trusted_path() {
  local current="$1"
  while [[ "$current" != "/" ]]; do
    local owner mode
    owner=$(stat -c '%u' "$current")
    mode=$(stat -c '%a' "$current")
    if [[ "$owner" != 0 || $((8#$mode & 8#022)) -ne 0 ]]; then
      return 1
    fi
    current=$(dirname "$current")
  done
}

usage() {
  cat <<'EOF'
Usage: sudo bash infrastructure/export-pilot-database.sh \
  --env-file /path/to/HelloDeploy/.env \
  --output /protected/encrypted-storage/mongodb.archive.gz \
  --tools-dir /root-owned/mongodb-database-tools/bin

The output parent must already exist, be root-owned, and deny group and other
access. The MongoDB tool binaries must be root-owned and not group/other
writable. This command creates a compressed mongodump archive, checks it with
mongorestore --dryRun, and writes a matching SHA-256 checksum. It does not
create an Atlas snapshot or prove cross-host restoration.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --output) OUTPUT_FILE="${2:-}"; shift 2 ;;
    --tools-dir) TOOLS_DIR="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) error "Unknown or incomplete argument."; usage >&2; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  error "Run this database export as root."
  exit 1
fi
if [[ -z "$ENV_FILE" || -z "$OUTPUT_FILE" || -z "$TOOLS_DIR" ]]; then
  error "Environment file, output file, and MongoDB tools directory are required."
  usage >&2
  exit 2
fi

for command in node realpath sha256sum stat; do
  command -v "$command" >/dev/null 2>&1 || {
    error "A required command is unavailable."
    exit 1
  }
done
NODE_BINARY=$(realpath -e "$(command -v node)")
if ! require_root_trusted_path "$NODE_BINARY"; then
  error "The Node.js runtime must be root-owned and not group/other writable."
  exit 1
fi

if [[ -L "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
  error "The environment source must be a regular non-symlink file."
  exit 1
fi
ENV_FILE=$(realpath -e "$ENV_FILE")
ENV_MODE=$(stat -c '%a' "$ENV_FILE")
if [[ ! "$ENV_MODE" =~ ^[0-7]*00$ ]]; then
  error "The environment source must deny group and other access."
  exit 1
fi

TOOLS_DIR=$(realpath -e "$TOOLS_DIR")
if ! require_root_trusted_path "$TOOLS_DIR"; then
  error "The MongoDB tools path must be root-owned and not group/other writable."
  exit 1
fi
for binary_name in mongodump mongorestore; do
  binary="$TOOLS_DIR/$binary_name"
  if [[ -L "$binary" || ! -f "$binary" || ! -x "$binary" ]]; then
    error "A required MongoDB tool is unavailable or unsafe."
    exit 1
  fi
  binary_owner=$(stat -c '%u' "$binary")
  binary_mode=$(stat -c '%a' "$binary")
  if [[ "$binary_owner" != 0 || $((8#$binary_mode & 8#022)) -ne 0 ]]; then
    error "MongoDB tool binaries must be root-owned and not group/other writable."
    exit 1
  fi
done

OUTPUT_PARENT=$(dirname "$OUTPUT_FILE")
if [[ ! -d "$OUTPUT_PARENT" ]]; then
  error "The protected output directory must already exist."
  exit 1
fi
OUTPUT_PARENT=$(realpath -e "$OUTPUT_PARENT")
OUTPUT_NAME=$(basename "$OUTPUT_FILE")
if [[ ! "$OUTPUT_NAME" =~ ^[A-Za-z0-9._+-]+\.archive\.gz$ ]]; then
  error "The output filename must use a safe .archive.gz name."
  exit 1
fi
OUTPUT_FILE="$OUTPUT_PARENT/$OUTPUT_NAME"
CHECKSUM_FILE="$OUTPUT_FILE.sha256"
OUTPUT_OWNER=$(stat -c '%u' "$OUTPUT_PARENT")
OUTPUT_MODE=$(stat -c '%a' "$OUTPUT_PARENT")
if [[ "$OUTPUT_OWNER" != 0 || ! "$OUTPUT_MODE" =~ ^[0-7]*00$ ]]; then
  error "The protected output directory must be root-owned and private."
  exit 1
fi
if ! require_root_trusted_path "$OUTPUT_PARENT"; then
  error "The protected output path must not traverse writable directories."
  exit 1
fi
if [[ -e "$OUTPUT_FILE" || -e "$CHECKSUM_FILE" || -e "$OUTPUT_FILE.partial" ]]; then
  error "Refusing to overwrite an existing database export."
  exit 1
fi

umask 077
RUNTIME_DIR=$(mktemp -d /run/hellodeploy-mongodump.XXXXXX)
CONFIG_FILE="$RUNTIME_DIR/mongodb-tools-config.yml"
VERIFY_LOG="$RUNTIME_DIR/verify.log"
PARTIAL_FILE="$OUTPUT_FILE.partial"
cleanup() {
  rm -f -- "$PARTIAL_FILE"
  rm -rf -- "$RUNTIME_DIR"
}
trap cleanup EXIT INT TERM HUP

"$NODE_BINARY" --env-file="$ENV_FILE" <<'NODE' > "$CONFIG_FILE"
const uri = process.env.MONGODB_URI;
if (typeof uri !== 'string' || uri.length === 0) {
  process.stderr.write('The MongoDB connection setting is unavailable.\n');
  process.exit(1);
}
process.stdout.write(JSON.stringify({ uri }));
NODE
chmod 0600 "$CONFIG_FILE"

info "Creating a compressed database export in protected storage."
if ! "$TOOLS_DIR/mongodump" \
  --config="$CONFIG_FILE" \
  --archive="$PARTIAL_FILE" \
  --gzip \
  --quiet >/dev/null 2>&1; then
  error "The database export failed; no completed artifact was retained."
  exit 1
fi
if [[ ! -s "$PARTIAL_FILE" ]]; then
  error "The database export is empty; no completed artifact was retained."
  exit 1
fi
chmod 0600 "$PARTIAL_FILE"

info "Checking the archive without restoring data."
if ! "$TOOLS_DIR/mongorestore" \
  --config="$CONFIG_FILE" \
  --archive="$PARTIAL_FILE" \
  --gzip \
  --dryRun \
  --quiet >"$VERIFY_LOG" 2>&1; then
  error "The database archive check failed; no completed artifact was retained."
  exit 1
fi

mv -- "$PARTIAL_FILE" "$OUTPUT_FILE"
(
  cd "$OUTPUT_PARENT"
  sha256sum -- "$OUTPUT_NAME" > "$OUTPUT_NAME.sha256"
)
chmod 0600 "$OUTPUT_FILE" "$CHECKSUM_FILE"
sync -f "$OUTPUT_PARENT"

info "Database export and non-restoring archive check passed."
info "Use this protected export with backup-pilot.sh --database-export."
info "This does not satisfy the cross-host restore gate."
