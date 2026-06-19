#!/usr/bin/env bash
# HelloDeploy installer for Ubuntu 22.04 / 24.04.
#
# Run as root on a clean Ubuntu server:
#   curl -fsSL https://raw.githubusercontent.com/.../install.sh | sudo bash
#   or
#   sudo bash infrastructure/install.sh
#
# The script installs system dependencies, creates a dedicated system user,
# clones the repository, installs npm packages, and runs the setup wizard.
set -euo pipefail

HD_USER="hellodeploy"
HD_HOME="/opt/hellodeploy"
HD_DATA="/var/lib/hellodeploy"
HD_LOG="/var/log/hellodeploy"
REPO_URL="${HELLODEPLOY_REPO_URL:-https://github.com/4hprojects/HelloDeploy.git}"
REPO_BRANCH="${HELLODEPLOY_BRANCH:-main}"
NODE_MAJOR=22

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

if ! grep -qE 'VERSION_ID="(22\.04|24\.04)"' /etc/os-release 2>/dev/null; then
  error "Unsupported OS.  HelloDeploy requires Ubuntu 22.04 or 24.04."
  exit 1
fi

info "Ubuntu $(grep VERSION_ID /etc/os-release | cut -d= -f2 | tr -d '"') detected."

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

# Nginx
if ! command -v nginx &>/dev/null; then
  info "Installing Nginx…"
  apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
else
  info "Nginx $(nginx -v 2>&1 | grep -oP '[\d.]+') already installed."
fi

# Redis
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

# PM2
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2…"
  npm install -g pm2
else
  info "PM2 $(pm2 --version) already installed."
fi

# ─── system user ─────────────────────────────────────────────────────────────

section "System user"
if ! id "$HD_USER" &>/dev/null; then
  useradd --system --shell /bin/bash --home-dir "$HD_HOME" --create-home "$HD_USER"
  info "Created system user '$HD_USER'."
else
  info "User '$HD_USER' already exists."
fi

# Worker needs Docker socket access — web process does NOT
usermod -aG docker "$HD_USER"

# ─── directories ─────────────────────────────────────────────────────────────

section "Directories"
for dir in "$HD_DATA/builds" "$HD_DATA/releases" "$HD_DATA/projects" "$HD_LOG"; do
  mkdir -p "$dir"
  chown "$HD_USER:$HD_USER" "$dir"
  info "Created $dir"
done

# Nginx hellodeploy.d directory
mkdir -p /etc/nginx/hellodeploy.d
chown root:root /etc/nginx/hellodeploy.d
chmod 755 /etc/nginx/hellodeploy.d

# Add include directive if not already present
NGINX_INCLUDE="include /etc/nginx/hellodeploy.d/*.conf;"
if ! grep -qF "hellodeploy.d" /etc/nginx/nginx.conf; then
  echo -e "\n# HelloDeploy managed routes\n${NGINX_INCLUDE}" >> /etc/nginx/conf.d/hellodeploy.conf
  info "Added Nginx include for hellodeploy.d"
fi

# ─── application ─────────────────────────────────────────────────────────────

section "Application"
if [[ -d "$HD_HOME/.git" ]]; then
  warn "Repository already exists at $HD_HOME — skipping clone."
  warn "To upgrade, run:  sudo bash infrastructure/upgrade.sh"
else
  info "Cloning $REPO_URL…"
  git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" "$HD_HOME"
  chown -R "$HD_USER:$HD_USER" "$HD_HOME"
fi

cd "$HD_HOME"
info "Installing npm dependencies…"
sudo -u "$HD_USER" npm install --omit=dev

# ─── secrets / setup ─────────────────────────────────────────────────────────

section "Configuration"
ENV_FILE="$HD_HOME/.env"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — skipping secret generation."
else
  info "Generating secrets…"
  sudo -u "$HD_USER" node scripts/generate-secrets.js --write --output "$ENV_FILE"
fi

info "Launching setup wizard…"
sudo -u "$HD_USER" node scripts/setup.js --output "$ENV_FILE" --skip-existing

# ─── PM2 ─────────────────────────────────────────────────────────────────────

section "PM2 startup"
pm2 startup systemd -u "$HD_USER" --hp "$HD_HOME" | tail -1 | bash || true
sudo -u "$HD_USER" pm2 start "$HD_HOME/ecosystem.config.cjs"
sudo -u "$HD_USER" pm2 save

info "PM2 configured.  Use 'pm2 status' to check service health."

# ─── done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}HelloDeploy installed successfully!${NC}"
echo ""
echo "  Web UI:       https://$(grep PLATFORM_DOMAIN "$ENV_FILE" | cut -d= -f2)"
echo "  Logs:         pm2 logs"
echo "  Status:       pm2 status"
echo "  Seed admin:   sudo -u $HD_USER node $HD_HOME/scripts/seed-super-admin.js"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC} Back up HELLODEPLOY_MASTER_KEY from $ENV_FILE to a secure"
echo "location outside this server.  Losing it makes all stored secrets unrecoverable."
echo ""
