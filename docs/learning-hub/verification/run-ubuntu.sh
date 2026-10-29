#!/bin/bash
set -u
export DEBIAN_FRONTEND=noninteractive
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
. /etc/os-release; echo "os $PRETTY_NAME"
apt-get update -qq >/dev/null
apt-get install -y -qq openssh-server ufw unattended-upgrades nginx curl ca-certificates gnupg >/dev/null 2>&1
echo "nodejs candidate: $(apt-cache policy nodejs | awk '/Candidate/ {print $2}')"
ssh-keygen -A >/dev/null
cat > /etc/ssh/sshd_config.d/60-hardening.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF
mkdir -p /run/sshd
check "A2 sshd -t accepts hardening drop-in" "sshd -t"
check "A2 drop-in is applied" "sshd -T 2>/dev/null | grep -qx 'passwordauthentication no'"
check "A2 OpenSSH ufw profile exists" "ufw app list 2>/dev/null | grep -q OpenSSH"
check "A2 ufw dry-run allow OpenSSH" "ufw --dry-run allow OpenSSH >/dev/null 2>&1"
check "A2 ufw dry-run default deny incoming" "ufw --dry-run default deny incoming >/dev/null 2>&1"
check "A2 unattended-upgrades config present" "test -f /etc/apt/apt.conf.d/50unattended-upgrades"
check "A2 nginx -t default" "nginx -t >/dev/null 2>&1"
# Cloudflare's documented apt repository for cloudflared
mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq cloudflared >/dev/null 2>&1
check "A2 cloudflared installs from Cloudflare apt repo" "cloudflared --version >/dev/null 2>&1"
cloudflared --version 2>/dev/null | head -1
mkdir -p /root/.cloudflared
cat > /root/.cloudflared/config.yml <<'CONF'
tunnel: 00000000-0000-0000-0000-000000000000
credentials-file: /root/.cloudflared/00000000-0000-0000-0000-000000000000.json
ingress:
  - hostname: app.example.com
    service: http://localhost:80
  - service: http_status:404
CONF
check "A2 ingress validate accepts example" "cloudflared tunnel --config /root/.cloudflared/config.yml ingress validate >/dev/null 2>&1"
check "A2 ingress rule resolves hostname" "cloudflared tunnel --config /root/.cloudflared/config.yml ingress rule https://app.example.com 2>&1 | grep -q 'http://localhost:80'"
