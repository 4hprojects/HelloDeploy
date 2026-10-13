#!/usr/bin/env bash
# Install pull-based production auto-deploy (scripts/autodeploy.js).
#
# Every 5 minutes a root timer fetches `main`; when it is ahead of
# /opt/hellodeploy and the CI workflow passed on it, upgrade.sh deploys it.
#
# Prerequisite: /opt/hellodeploy must already run a release that contains
# scripts/autodeploy.js (deploy it once with upgrade.sh).
#
# Usage (idempotent; re-run after adding the deploy key):
#   sudo bash infrastructure/install-autodeploy.sh
set -euo pipefail

HD_HOME="/opt/hellodeploy"
CONFIG_DIR="/etc/hellodeploy"
DEPLOY_KEY="/root/.ssh/hellodeploy_deploy_key"
KNOWN_HOSTS="$CONFIG_DIR/github_known_hosts"
TOKEN_FILE="$CONFIG_DIR/autodeploy-github-token"
# Published by GitHub at https://api.github.com/meta (ssh_key_fingerprints.SHA256_ED25519).
GITHUB_ED25519_FINGERPRINT="SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${GREEN}[info]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}── $* ──${NC}"; }

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root.  Try: sudo bash $0"
  exit 1
fi
if [[ ! -d "$HD_HOME/.git" ]]; then
  error "$HD_HOME is not a git checkout. Install HelloDeploy first."
  exit 1
fi
if [[ ! -f "$HD_HOME/scripts/autodeploy.js" ]]; then
  error "$HD_HOME does not contain scripts/autodeploy.js yet."
  error "Deploy a release that includes auto-deploy once with upgrade.sh, then re-run this."
  exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT
# /etc/hellodeploy already holds platform configuration such as the GitHub App
# key, which web and worker read through the hellodeploy-config group. Never
# change an existing directory's owner or mode; the token file below is 0600.
if [[ ! -d "$CONFIG_DIR" ]]; then
  install -d -m 0750 -o root -g hellodeploy-config "$CONFIG_DIR"
fi
install -d -m 0700 /root/.ssh

section "GitHub host key"
# Taken from GitHub's TLS-authenticated API rather than ssh-keyscan, which
# intermittently returns nothing here; the pinned fingerprint is still checked.
curl -fsS --max-time 20 https://api.github.com/meta \
  | node -e 'let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
      const key = JSON.parse(raw).ssh_keys.find((k) => k.startsWith("ssh-ed25519 "));
      if (key) console.log(`github.com ${key}`);
    });' > "$WORK_DIR/github_known_hosts" || true
fingerprint=$(ssh-keygen -lf "$WORK_DIR/github_known_hosts" 2>/dev/null | awk '{print $2}' || true)
if [[ "$fingerprint" != "$GITHUB_ED25519_FINGERPRINT" ]]; then
  error "github.com presented ${fingerprint:-no key}, expected $GITHUB_ED25519_FINGERPRINT."
  error "Refusing to trust it. Check the network path, then re-run."
  exit 1
fi
install -m 0644 "$WORK_DIR/github_known_hosts" "$KNOWN_HOSTS"
info "Pinned github.com ($fingerprint)."

section "Read-only deploy key"
if [[ ! -f "$DEPLOY_KEY" ]]; then
  ssh-keygen -q -t ed25519 -N '' -C "hellodeploy-autodeploy@$(hostname)" -f "$DEPLOY_KEY"
  info "Created $DEPLOY_KEY."
else
  info "Using existing $DEPLOY_KEY."
fi

remote=$(git -C "$HD_HOME" remote get-url origin)
repository=$(sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##; s#/$##' <<<"$remote")
if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  error "Could not read a GitHub owner/repo from the origin remote: $remote"
  exit 1
fi
# Stored in .git/config, so the working tree upgrade.sh checks stays clean.
git -C "$HD_HOME" remote set-url origin "git@github.com:${repository}.git"
git -C "$HD_HOME" config core.sshCommand \
  "ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o StrictHostKeyChecking=yes"

if ! git -C "$HD_HOME" ls-remote origin HEAD >/dev/null 2>&1; then
  warn "GitHub does not accept the deploy key yet. Add it, then re-run this script:"
  echo "  1. Open https://github.com/${repository}/settings/keys/new"
  echo "  2. Title: hellodeploy-autodeploy ($(hostname)); leave 'Allow write access' unchecked"
  echo "  3. Key:"
  echo ""
  cat "$DEPLOY_KEY.pub"
  echo ""
  exit 1
fi
info "Fetching ${repository} over SSH works."

section "CI status token"
if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "Create a fine-grained token at https://github.com/settings/personal-access-tokens/new"
  echo "  Repository access: only ${repository}"
  echo "  Permissions:       Actions → Read-only (Metadata → Read-only is added automatically)"
  read -r -s -p "Paste the token: " token
  echo ""
  if [[ -z "$token" ]]; then
    error "No token entered."
    exit 1
  fi
  (umask 077 && printf '%s\n' "$token" > "$TOKEN_FILE")
  unset token
fi
chmod 600 "$TOKEN_FILE"

# Header file keeps the token out of the process list.
(umask 077 && printf 'Authorization: Bearer %s\n' "$(tr -d '[:space:]' < "$TOKEN_FILE")" > "$WORK_DIR/auth-header")
status=$(curl -sS -o /dev/null -w '%{http_code}' -H @"$WORK_DIR/auth-header" \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?per_page=1")
if [[ "$status" != "200" ]]; then
  error "The token cannot read CI runs for ${repository} (HTTP $status)."
  error "Fix its permissions, or remove $TOKEN_FILE and re-run to enter a new one."
  exit 1
fi
info "The token can read CI runs."

section "Timer"
install -m 0644 "$SCRIPT_DIR/systemd/hellodeploy-autodeploy.service" /etc/systemd/system/
install -m 0644 "$SCRIPT_DIR/systemd/hellodeploy-autodeploy.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hellodeploy-autodeploy.timer

echo ""
echo -e "${GREEN}${BOLD}Auto-deploy enabled.${NC} Green merges to main deploy within about 5 minutes."
echo "  Watch:    journalctl -u hellodeploy-autodeploy -f"
echo "  Next run: systemctl list-timers hellodeploy-autodeploy.timer"
echo "  Pause:    sudo touch $CONFIG_DIR/autodeploy.disabled   (resume: sudo rm it)"
echo "  Retry a commit that failed: remove it from failedShas in /var/lib/hellodeploy/autodeploy-state.json"
