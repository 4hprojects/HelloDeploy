#!/bin/bash
# Runs inside node:26-bookworm-slim. Prints PASS/FAIL lines as evidence.
set -u
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
cp -r /src /work && cd /work
apt-get update -qq >/dev/null && apt-get install -y -qq curl nginx >/dev/null 2>&1
echo "node $(node --version) npm $(npm --version) nginx $(nginx -v 2>&1 | cut -d/ -f2)"
npm init -y >/dev/null && npm install --no-audit --no-fund express@5 >/dev/null 2>&1
echo "express $(node -p "require('express/package.json').version")"
# A1: start command and PORT binding
PORT=4000 node server.js > node.log 2>&1 & NODEPID=$!; sleep 1.5
check "A1 app binds PORT env" "curl -fs localhost:4000/healthz | grep -q '\"status\":\"ok\"'"
kill -TERM $NODEPID; sleep 1
check "A1 SIGTERM closes server" "! kill -0 $NODEPID 2>/dev/null"
# A4: PM2
npm install -g --no-audit --no-fund pm2 >/dev/null 2>&1; echo "pm2 $(pm2 --version | tail -1)"
pm2 start ecosystem.config.cjs >/dev/null 2>&1; sleep 2
check "A4 pm2 start ecosystem" "pm2 jlist | grep -q '\"status\":\"online\"'"
check "A4 app on 3000 under pm2" "curl -fs localhost:3000/healthz >/dev/null"
pm2 reload myapp >/dev/null 2>&1; sleep 2
check "A4 pm2 reload keeps online" "curl -fs localhost:3000/healthz >/dev/null"
check "A4 pm2 logs --nostream" "pm2 logs myapp --lines 5 --nostream 2>&1 | grep -q 'Listening on port 3000'"
check "A4 pm2 save" "pm2 save >/dev/null 2>&1 && test -f ~/.pm2/dump.pm2"
# A4: nginx reverse proxy
cp nginx-site.conf /etc/nginx/sites-available/myapp
ln -sf /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/myapp
rm -f /etc/nginx/sites-enabled/default
check "A4 nginx -t" "nginx -t 2>&1 | grep -q 'test is successful'"
nginx
check "A4 proxy returns app" "curl -fs -H 'Host: example.com' localhost/ | grep -q 'Hello from Node.js'"
pm2 stop myapp >/dev/null 2>&1; sleep 1
check "A4 stopped app gives 502" "test \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: example.com' localhost/)\" = 502"
check "A4 error log names upstream refusal" "grep -q 'connect() failed (111: Connection refused) while connecting to upstream' /var/log/nginx/error.log"
pm2 start myapp >/dev/null 2>&1; sleep 2
# A5: helmet, rate limit, trust proxy
npm install --no-audit --no-fund helmet express-rate-limit >/dev/null 2>&1
npm ls helmet express-rate-limit --depth=0 2>/dev/null | tail -n +2
PORT=3001 node secure.js & SECPID=$!; sleep 1.5
check "A5 helmet sets CSP" "curl -sI localhost:3001/ip | grep -qi '^content-security-policy:'"
check "A5 helmet sets HSTS" "curl -sI localhost:3001/ip | grep -qi '^strict-transport-security:'"
check "A5 x-powered-by removed" "! curl -sI localhost:3001/ip | grep -qi '^x-powered-by'"
for i in 1 2 3 4 5; do curl -s -o /dev/null -X POST localhost:3001/login; done
check "A5 6th login is 429" "test \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3001/login)\" = 429"
check "A5 loopback proxy header trusted" "curl -s -H 'X-Forwarded-For: 203.0.113.9' localhost:3001/ip | grep -q '203.0.113.9'"
check "A5 npm audit runs" "npm audit --omit=dev >/dev/null 2>&1; test \$? -le 1"
kill $SECPID
check "A5 npm ci reproducible" "rm -rf node_modules && npm ci --omit=dev >/dev/null 2>&1 && test -d node_modules/express"
