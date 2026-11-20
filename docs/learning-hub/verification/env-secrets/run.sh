#!/bin/bash
# Runs inside node:26-bookworm-slim with this folder mounted read-only at /src:
#   docker run --rm --memory 768m --cpus 1 -v "$PWD":/src:ro node:26-bookworm-slim bash /src/run.sh
# Prints PASS/FAIL lines as evidence for "How to Protect Environment Variables and API Keys in Production".
set -u
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
apt-get update -qq >/dev/null && apt-get install -y -qq git >/dev/null 2>&1
echo "node $(node --version) npm $(npm --version) git $(git --version | cut -d' ' -f3)"
cp -r /src/app /work && cd /work
printf 'PAYMENT_API_KEY=from-file\nDATABASE_URL=postgres://app@db/app\n' > .env
check "--env-file loads values" "test \"\$(node --env-file=.env -p process.env.PAYMENT_API_KEY)\" = from-file"
check "real environment wins over --env-file" "test \"\$(PAYMENT_API_KEY=from-shell node --env-file=.env -p process.env.PAYMENT_API_KEY)\" = from-shell"
check "--env-file fails when file is missing" "! node --env-file=missing.env -e '' 2>/dev/null"
check "--env-file-if-exists tolerates a missing file" "node --env-file-if-exists=missing.env -e ''"
check "process.loadEnvFile loads values" "test \"\$(node -e \"process.loadEnvFile('.env'); console.log(process.env.PAYMENT_API_KEY)\")\" = from-file"
check "startup check exits 1 when a variable is missing" "! env -u PAYMENT_API_KEY -u DATABASE_URL node start.js 2>err.txt"
check "startup error names the variable" "grep -q 'PAYMENT_API_KEY' err.txt"
check "startup error does not print values" "! node --env-file=.env -e \"delete process.env.DATABASE_URL; require('./config')\" 2>&1 | grep -q from-file"
check "startup succeeds with all variables" "node --env-file=.env start.js | grep -q 'Config loaded'"
check "child process inherits the secret" "test \"\$(PAYMENT_API_KEY=s3cret node -e \"process.stdout.write(require('child_process').execSync('printenv PAYMENT_API_KEY').toString())\")\" = s3cret"
check "child with an explicit env does not" "! PAYMENT_API_KEY=s3cret node -e \"require('child_process').execSync('printenv PAYMENT_API_KEY', { env: { PATH: process.env.PATH }, stdio: 'ignore' })\" 2>/dev/null"
useradd -m appuser && useradd -m otheruser
su appuser -s /bin/bash -c "PAYMENT_API_KEY=s3cret node -e 'setTimeout(()=>{},20000)' & echo \$! > /tmp/app.pid"; sleep 1
APPPID=$(cat /tmp/app.pid)
check "same user can read /proc/PID/environ" "su appuser -s /bin/bash -c \"tr '\\\\0' '\\\\n' < /proc/$APPPID/environ\" | grep -q 'PAYMENT_API_KEY=s3cret'"
check "other user cannot read /proc/PID/environ" "! su otheruser -s /bin/bash -c \"cat /proc/$APPPID/environ\" >/dev/null 2>&1"
kill $APPPID 2>/dev/null
mkdir /repo && cd /repo && git init -q && git config user.email t@example.com && git config user.name t
echo 'PAYMENT_API_KEY=sk_test_leaked' > .env && git add .env && git commit -qm 'add config'
git rm -q .env && git commit -qm 'remove secret'
check "deleted secret still in git history" "git log -p --all | grep -q sk_test_leaked"
echo '.env' > .gitignore && echo 'PAYMENT_API_KEY=x' > .env
check ".gitignore keeps .env out of git status" "! git status --porcelain | grep -q '\\.env\$'"
check "git check-ignore confirms .env is ignored" "git check-ignore -q .env"
cp -r /src/vite /vite && cd /vite && npm init -y >/dev/null && npm install --no-audit --no-fund vite >/dev/null 2>&1
echo "vite $(node -p "require('vite/package.json').version")"
printf 'VITE_API_BASE_URL=https://api.example.test\nDB_PASSWORD=do-not-ship\n' > .env
npx vite build >/dev/null 2>&1
check "vite inlines VITE_ variable into the bundle" "grep -rq 'https://api.example.test' dist/"
check "vite leaves unprefixed variable out of the bundle" "! grep -rq 'do-not-ship' dist/"
