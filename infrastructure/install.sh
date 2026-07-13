#!/usr/bin/env bash
# HelloDeploy installer for supported Ubuntu 22.04 / 24.04.
# Ubuntu 26.04 is candidate-only and requires explicit acknowledgement.
#
# Run as root on a clean Ubuntu server:
#   curl -fsSL https://raw.githubusercontent.com/.../install.sh | sudo bash
#   or
#   sudo bash infrastructure/install.sh
#
# The script installs system dependencies, creates a dedicated system user,
# clones the repository, installs npm packages, and runs the setup wizard.
set -euo pipefail

HD_WEB_USER="hellodeploy-web"
HD_WORKER_USER="hellodeploy-worker"
HD_CONFIG_GROUP="hellodeploy-config"
HD_NGINX_GROUP="hellodeploy-nginx"
HD_HOME="/opt/hellodeploy"
HD_DATA="/var/lib/hellodeploy"
HD_LOG="/var/log/hellodeploy"
REPO_URL="${HELLODEPLOY_REPO_URL:-https://github.com/4hprojects/HelloDeploy.git}"
RELEASE_REF="${HELLODEPLOY_RELEASE_REF:-}"
NODE_MAJOR=22
NPM_MAJOR=10
ALLOW_CANDIDATE_OS="${HELLODEPLOY_ALLOW_CANDIDATE_OS:-false}"
PILOT_BACKUP_VERIFIED="${HELLODEPLOY_PILOT_BACKUP_VERIFIED:-false}"
ROLLBACK_BASELINE_VERIFIED="${HELLODEPLOY_ROLLBACK_BASELINE_VERIFIED:-false}"
PREPARE_ONLY="${HELLODEPLOY_PREPARE_ONLY:-false}"
CONFIG_SOURCE="${HELLODEPLOY_CONFIG_SOURCE:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${GREEN}[info]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}── $* ──${NC}"; }

# ─── guards ──────────────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root.  Try: sudo bash $0"
  exit 1
fi
if [[ -z "$RELEASE_REF" ]]; then
  error "HELLODEPLOY_RELEASE_REF must name an immutable tag or full commit."
  exit 1
fi
if [[ "$PREPARE_ONLY" != "true" && "$PREPARE_ONLY" != "false" ]]; then
  error "HELLODEPLOY_PREPARE_ONLY must be true or false."
  exit 1
fi
if [[ "$PREPARE_ONLY" == "true" && -z "$CONFIG_SOURCE" ]]; then
  error "Preparation mode requires HELLODEPLOY_CONFIG_SOURCE with reviewed production configuration."
  exit 1
fi
if [[ -n "$CONFIG_SOURCE" ]]; then
  if [[ -L "$CONFIG_SOURCE" || ! -f "$CONFIG_SOURCE" ]]; then
    error "HELLODEPLOY_CONFIG_SOURCE must be a private regular file, not a symlink."
    exit 1
  fi
  CONFIG_SOURCE=$(realpath -e "$CONFIG_SOURCE")
  CONFIG_SOURCE_MODE=$(stat -c '%a' "$CONFIG_SOURCE")
  CONFIG_SOURCE_OWNER=$(stat -c '%u' "$CONFIG_SOURCE")
  CONFIG_SOURCE_PARENT=$(dirname "$CONFIG_SOURCE")
  CONFIG_SOURCE_PARENT_OWNER=$(stat -c '%u' "$CONFIG_SOURCE_PARENT")
  CONFIG_SOURCE_PARENT_MODE=$(stat -c '%a' "$CONFIG_SOURCE_PARENT")
  if [[ "$CONFIG_SOURCE_OWNER" != 0 || ! "$CONFIG_SOURCE_MODE" =~ ^[0-7]*00$ ]]; then
    error "HELLODEPLOY_CONFIG_SOURCE must be root-owned and deny group and other access."
    exit 1
  fi
  if [[ "$CONFIG_SOURCE_PARENT_OWNER" != 0 || $((8#$CONFIG_SOURCE_PARENT_MODE & 0022)) -ne 0 ]]; then
    error "HELLODEPLOY_CONFIG_SOURCE parent must be root-owned and not group or other writable."
    exit 1
  fi
  if [[ "$CONFIG_SOURCE" == "$HD_HOME"/* ]]; then
    error "HELLODEPLOY_CONFIG_SOURCE must remain outside the installation checkout."
    exit 1
  fi
fi

OS_ID=$(awk -F= '$1 == "ID" {gsub(/"/, "", $2); print tolower($2); exit}' /etc/os-release 2>/dev/null || true)
OS_VERSION=$(awk -F= '$1 == "VERSION_ID" {gsub(/"/, "", $2); print $2; exit}' /etc/os-release 2>/dev/null || true)
case "$OS_ID:$OS_VERSION" in
  ubuntu:22.04|ubuntu:24.04)
    info "Supported Ubuntu $OS_VERSION detected."
    ;;
  ubuntu:26.04)
    if [[ "$ALLOW_CANDIDATE_OS" != "true" ]]; then
      error "Ubuntu 26.04 is candidate-only. Set HELLODEPLOY_ALLOW_CANDIDATE_OS=true only after the in-place backup and rollback baseline passes."
      exit 1
    fi
    if [[ "$PILOT_BACKUP_VERIFIED" != "true" || "$ROLLBACK_BASELINE_VERIFIED" != "true" ]]; then
      error "Ubuntu 26.04 candidate installation requires separately verified pilot backup and rollback baseline acknowledgements."
      exit 1
    fi
    warn "Ubuntu 26.04 candidate explicitly acknowledged; this does not establish supported status."
    ;;
  *)
    error "Unsupported OS. HelloDeploy supports Ubuntu 22.04 and 24.04; Ubuntu 26.04 is candidate-only."
    exit 1
    ;;
esac

if [[ "$PREPARE_ONLY" == "true" ]]; then
  for service in hellodeploy-web hellodeploy-worker hellodeploy-nginx-helper; do
    if systemctl is-active --quiet "$service" 2>/dev/null || systemctl is-enabled --quiet "$service" 2>/dev/null; then
      error "Preparation mode refuses to replace an active or enabled HelloDeploy service."
      exit 1
    fi
  done
fi

# ─── system packages ─────────────────────────────────────────────────────────

section "System packages"
apt-get update -qq

# Node.js 22 via NodeSource
if ! command -v node &>/dev/null || [[ $(node -e 'process.stdout.write(process.versions.node.split(".")[0])') -lt $NODE_MAJOR ]]; then
  info "Installing Node.js $NODE_MAJOR…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  info "Node.js $(node --version) already installed."
fi

NPM_VERSION=$(npm --version 2>/dev/null || true)
NPM_CURRENT_MAJOR=${NPM_VERSION%%.*}
if [[ ! "$NPM_CURRENT_MAJOR" =~ ^[0-9]+$ || "$NPM_CURRENT_MAJOR" -lt $NPM_MAJOR ]]; then
  info "Installing npm $NPM_MAJOR…"
  npm install --global "npm@$NPM_MAJOR"
else
  info "npm $NPM_VERSION already satisfies the npm >= $NPM_MAJOR requirement."
fi

# Nginx
if ! command -v nginx &>/dev/null; then
  info "Installing Nginx…"
  apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
else
  info "Nginx $(nginx -v 2>&1 | grep -oP '[\d.]+') already installed."
fi

# Redis is installed locally by default. Operators may configure a managed
# rediss:// service during setup without changing the single-host platform role.
if ! command -v redis-cli &>/dev/null; then
  info "Installing Redis…"
  apt-get install -y redis-server
  systemctl enable redis-server
  systemctl start redis-server
else
  info "Redis already installed."
fi

# Docker
if ! command -v docker &>/dev/null; then
  info "Installing Docker Engine…"
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io
  systemctl enable docker
  systemctl start docker
else
  info "Docker $(docker --version | grep -oP '[\d.]+' | head -1) already installed."
fi

# ─── system user ─────────────────────────────────────────────────────────────

section "System user"
getent group "$HD_CONFIG_GROUP" &>/dev/null || groupadd --system "$HD_CONFIG_GROUP"
getent group "$HD_NGINX_GROUP" &>/dev/null || groupadd --system "$HD_NGINX_GROUP"

if ! id "$HD_WEB_USER" &>/dev/null; then
  useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/hellodeploy-web --create-home "$HD_WEB_USER"
  info "Created unprivileged web user '$HD_WEB_USER'."
fi
if ! id "$HD_WORKER_USER" &>/dev/null; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$HD_DATA" --create-home "$HD_WORKER_USER"
  info "Created deployment worker user '$HD_WORKER_USER'."
fi

usermod -aG "$HD_CONFIG_GROUP" "$HD_WEB_USER"
usermod -aG "$HD_CONFIG_GROUP","$HD_NGINX_GROUP",docker "$HD_WORKER_USER"

# ─── directories ─────────────────────────────────────────────────────────────

section "Directories"
for dir in "$HD_DATA/builds" "$HD_DATA/releases" "$HD_DATA/projects" "$HD_LOG"; do
  mkdir -p "$dir"
  chown "$HD_WORKER_USER:$HD_CONFIG_GROUP" "$dir"
  chmod 750 "$dir"
  info "Created $dir"
done

# Nginx hellodeploy.d directory
mkdir -p /etc/nginx/hellodeploy.d
chown root:root /etc/nginx/hellodeploy.d
chmod 755 /etc/nginx/hellodeploy.d

# Add include directive if not already present
NGINX_INCLUDE="include /etc/nginx/hellodeploy.d/*.conf;"
if [[ "$PREPARE_ONLY" == "true" ]]; then
  info "Preparation mode: global Nginx includes remain unchanged."
elif ! grep -qF "hellodeploy.d" /etc/nginx/nginx.conf; then
  echo -e "\n# HelloDeploy managed routes\n${NGINX_INCLUDE}" >> /etc/nginx/conf.d/hellodeploy.conf
  info "Added Nginx include for hellodeploy.d"
fi

# ─── application ─────────────────────────────────────────────────────────────

section "Application"
if [[ -d "$HD_HOME/.git" ]]; then
  if [[ -n "$(git -C "$HD_HOME" status --porcelain)" ]]; then
    error "Existing installation checkout is dirty; refusing to replace it."
    exit 1
  fi
  info "Repository already exists at $HD_HOME; resolving the requested release."
else
  info "Cloning release metadata from $REPO_URL…"
  git clone --no-checkout --filter=blob:none "$REPO_URL" "$HD_HOME"
fi

git -C "$HD_HOME" fetch --depth 1 origin "$RELEASE_REF"
RELEASE_COMMIT=$(git -C "$HD_HOME" rev-parse --verify 'FETCH_HEAD^{commit}')
git -C "$HD_HOME" checkout --detach "$RELEASE_COMMIT"
info "Checked out immutable release commit $RELEASE_COMMIT."

chown -R root:"$HD_CONFIG_GROUP" "$HD_HOME"
chmod -R u=rwX,g=rX,o= "$HD_HOME"

cd "$HD_HOME"
info "Installing npm dependencies…"
npm ci --omit=dev

# ─── secrets / setup ─────────────────────────────────────────────────────────

section "Configuration"
ENV_FILE="$HD_HOME/.env"

if [[ -n "$CONFIG_SOURCE" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    error "Installed configuration already exists; refusing to replace it from HELLODEPLOY_CONFIG_SOURCE."
    exit 1
  fi
  install -m 0640 -o root -g "$HD_CONFIG_GROUP" "$CONFIG_SOURCE" "$ENV_FILE"
  info "Installed reviewed configuration without generating or modifying secrets."
elif [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — skipping secret generation."
else
  info "Generating secrets…"
  node scripts/generate-secrets.js --write --output "$ENV_FILE"
fi

if [[ -z "$CONFIG_SOURCE" ]]; then
  info "Launching setup wizard…"
  node scripts/setup.js --output "$ENV_FILE" --skip-existing
fi
chown root:"$HD_CONFIG_GROUP" "$ENV_FILE"
chmod 640 "$ENV_FILE"

info "Validating production configuration for installed service identities…"
sudo -u "$HD_WEB_USER" node scripts/validate-config.js --component web --require-production
sudo -u "$HD_WORKER_USER" node scripts/validate-config.js --component worker --require-production

if [[ "$PREPARE_ONLY" == "true" ]]; then
  info "Preparation mode: platform ingress remains unchanged."
else
  bash infrastructure/nginx/configure-platform-ingress.sh "$ENV_FILE"
  info "Configured platform ingress."
fi

# ─── systemd services ────────────────────────────────────────────────────────

section "Systemd services"
install -m 0644 infrastructure/systemd/hellodeploy-worker.service /etc/systemd/system/
install -m 0644 infrastructure/systemd/hellodeploy-nginx-helper.service /etc/systemd/system/
install -m 0644 infrastructure/systemd/hellodeploy-web.service /etc/systemd/system/
systemctl daemon-reload
SERVICES=(hellodeploy-nginx-helper hellodeploy-worker hellodeploy-web)
if [[ "$PREPARE_ONLY" == "true" ]]; then
  info "Verifying the inactive prepared foundation…"
  HELLODEPLOY_EXPECTED_RELEASE_COMMIT="$RELEASE_COMMIT" bash infrastructure/verify-prepared-installation.sh
  info "Preparation mode complete; HelloDeploy services remain disabled and stopped."
  info "Do not activate them until the queue, pilot processes, ingress, and rollback gates are ready."
  exit 0
fi
systemctl enable --now "${SERVICES[@]}"
info "Systemd services enabled and started."

section "Installation verification"
bash infrastructure/verify-installation.sh

# ─── done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}HelloDeploy installed successfully!${NC}"
echo ""
echo "  Web UI:       https://$(grep PLATFORM_DOMAIN "$ENV_FILE" | cut -d= -f2)"
echo "  Logs:         journalctl -u 'hellodeploy-*'"
echo "  Status:       systemctl status hellodeploy-web hellodeploy-worker hellodeploy-nginx-helper"
echo "  Seed admin:   sudo -u $HD_WEB_USER node $HD_HOME/scripts/seed-super-admin.js"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC} Back up HELLODEPLOY_MASTER_KEY from $ENV_FILE to a secure"
echo "location outside this server.  Losing it makes all stored secrets unrecoverable."
echo ""
