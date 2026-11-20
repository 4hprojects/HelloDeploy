#!/bin/bash
# Runs inside ubuntu:26.04 with this folder mounted read-only at /src:
#   docker run --rm --memory 768m --cpus 1 -v "$PWD":/src:ro ubuntu:26.04 bash /src/run.sh
# Prints PASS/FAIL lines as evidence for "How to Secure Nginx and Node.js Applications on Ubuntu".
set -u
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && apt-get install -y -qq nginx nodejs curl openssl iproute2 systemd >/dev/null 2>&1
. /etc/os-release; echo "$PRETTY_NAME, nginx $(nginx -v 2>&1 | cut -d/ -f2), node $(node --version), openssl $(openssl version | cut -d' ' -f2), $(systemd-analyze --version | head -1)"
mkdir -p /etc/ssl/myapp && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=example.com' \
  -keyout /etc/ssl/myapp/privkey.pem -out /etc/ssl/myapp/fullchain.pem >/dev/null 2>&1
cp /src/proxy-headers.conf /etc/nginx/snippets/proxy-headers.conf
echo "nginx.conf ssl_protocols: $(grep -E "^\s*ssl_protocols" /etc/nginx/nginx.conf | tr -s " ")"
cp /src/myapp.conf /etc/nginx/sites-available/myapp
ln -sf /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/myapp && rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/letsencrypt/.well-known/acme-challenge && echo token-ok > /var/www/letsencrypt/.well-known/acme-challenge/test-token
check "nginx -t accepts the configuration" "nginx -t 2>&1 | grep -q 'test is successful'"
nginx
node /src/app.js & sleep 1
R="--resolve example.com:443:127.0.0.1 -k"
check "app listens on 127.0.0.1 only" "ss -tlnH 'sport = :3000' | grep -q '127.0.0.1:3000' && ! ss -tlnH 'sport = :3000' | grep -qE '0.0.0.0:3000|\\[::\\]:3000|\\*:3000'"
check "HTTP redirects to HTTPS" "curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H 'Host: example.com' http://127.0.0.1/ | grep -q '^301 https://example.com/'"
check "ACME challenge path is served over HTTP, not redirected" "curl -s -H 'Host: example.com' http://127.0.0.1/.well-known/acme-challenge/test-token | grep -q token-ok"
check "www host is served too" "curl -s -k --resolve www.example.com:443:127.0.0.1 https://www.example.com/ | grep -q 'hello from 127.0.0.1'"
check "IPv6 listener is active" "ss -tlnH | grep -q '\\[::\\]:443'"
check "HTTPS request reaches the app" "curl -s $R https://example.com/ | grep -q 'hello from 127.0.0.1'"
check "server header hides the nginx version" "curl -sI $R https://example.com/ | grep -i '^server:' | grep -qv '[0-9]'"
check "HSTS header present" "curl -sI $R https://example.com/ | grep -qi '^strict-transport-security: max-age=63072000'"
check "spoofed X-Forwarded-For is replaced" "curl -s $R -H 'X-Forwarded-For: 203.0.113.66' https://example.com/ | grep -q 'hello from 127.0.0.1'"
check "dotfiles are denied" "test \"\$(curl -s -o /dev/null -w '%{http_code}' $R https://example.com/.env)\" = 403"
check "body over 1 MB is rejected with 413" "test \"\$(head -c 2000000 /dev/zero | curl -s -o /dev/null -w '%{http_code}' $R --data-binary @- https://example.com/)\" = 413"
check "unknown Host on HTTP gets no response" "! curl -s -o /dev/null -H 'Host: other.example' http://127.0.0.1/ 2>/dev/null; test \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: other.example' http://127.0.0.1/)\" = 000"
check "unknown name on HTTPS: handshake rejected" "! curl -s -k --resolve other.example:443:127.0.0.1 https://other.example/ >/dev/null 2>&1"
check "TLS 1.1 is refused with a protocol_version alert (client allows it)" "echo | openssl s_client -connect 127.0.0.1:443 -servername example.com -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' 2>&1 | grep -q 'alert protocol version'"
check "TLS 1.2 handshake completes" "echo | openssl s_client -connect 127.0.0.1:443 -servername example.com -tls1_2 2>/dev/null | grep -q 'New, TLSv1.2'"
check "TLS 1.3 handshake completes" "echo | openssl s_client -connect 127.0.0.1:443 -servername example.com -tls1_3 2>/dev/null | grep -q 'New, TLSv1.3'"
CODES=$(for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}\n' $R https://example.com/login; done | sort | uniq -c | tr -s ' ' | tr '\n' ';')
echo "30 rapid /login requests: $CODES"
check "proxy_http_version 1.1 is in the loaded configuration" "grep -q 'proxy_http_version 1.1' /etc/nginx/snippets/proxy-headers.conf && nginx -T 2>/dev/null | grep -q 'proxy_http_version 1.1'"
check "login rate limit returns 429 under a burst" "echo '$CODES' | grep -q ' 429'"
mkdir -p /etc/myapp && touch /etc/myapp/env
H=$(systemd-analyze security --offline=yes --no-pager /src/myapp.service 2>&1 | grep -i 'overall exposure')
M=$(systemd-analyze security --offline=yes --no-pager /src/myapp-minimal.service 2>&1 | grep -i 'overall exposure')
echo "systemd-analyze, hardened unit: $H"
echo "systemd-analyze, minimal unit: $M"
score() { echo "$1" | grep -oE '[0-9]+\.[0-9]+' | head -1; }
check "hardened unit scores lower exposure than the minimal one" "awk -v a=\"$(score "$H")\" -v b=\"$(score "$M")\" 'BEGIN{exit !(a+0 < b+0 && a+0 > 0)}'"
check "hardened unit has no syntax warnings" "! systemd-analyze security --offline=yes --no-pager /src/myapp.service 2>&1 | grep -qiE 'unknown (key|section)|ignoring'"
