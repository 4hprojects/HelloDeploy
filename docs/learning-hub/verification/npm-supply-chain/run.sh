#!/bin/bash
# Runs inside node:26-bookworm-slim with this folder mounted read-only at /src:
#   docker run --rm --memory 768m --cpus 1 -v "$PWD":/src:ro node:26-bookworm-slim bash /src/run.sh
# Prints PASS/FAIL lines as evidence for "Software Supply Chain Attacks: The Hidden Risks in npm Packages".
set -u
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
Q='--no-audit --no-fund'
echo "node $(node --version) npm $(npm --version)"
cp -r /src /work && cd /work

mkdir app && cd app && npm init -y >/dev/null
npm install $Q ../install-script-demo >/dev/null 2>&1
check "install script runs on a normal install" "test -f /tmp/postinstall-ran"
rm -rf node_modules /tmp/postinstall-ran
npm ci $Q --ignore-scripts >/dev/null 2>&1
check "npm ci --ignore-scripts skips the install script" "test -d node_modules/install-script-demo && ! test -f /tmp/postinstall-ran"
rm -rf node_modules package-lock.json /tmp/postinstall-ran
npm install $Q --ignore-scripts ../install-script-demo >/dev/null 2>&1
check "--ignore-scripts skips the install script" "test -d node_modules/install-script-demo && ! test -f /tmp/postinstall-ran"
rm -rf node_modules package-lock.json
echo 'ignore-scripts=true' > .npmrc
npm install $Q ../install-script-demo >/dev/null 2>&1
check ".npmrc ignore-scripts=true skips it too" "test -d node_modules/install-script-demo && ! test -f /tmp/postinstall-ran"
cd /work && rm -rf app

mkdir lock && cd lock && npm init -y >/dev/null
npm install $Q express@4.21.2 >/dev/null 2>&1
echo "transitive packages under express 4.21.2: $(npm ls --all --parseable | tail -n +2 | wc -l)"
check "one direct dependency brings many packages" "test \$(npm ls --all --parseable | tail -n +2 | wc -l) -gt 50"
rm -rf node_modules
check "npm ci installs the locked version" "npm ci $Q >/dev/null 2>&1 && test \"\$(node -p \"require('express/package.json').version\")\" = 4.21.2"
node -e "const p=require('./package.json'); p.dependencies['left-pad']='^1.3.0'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))"
check "npm ci refuses when package.json and lockfile disagree" "! npm ci $Q >ci.log 2>&1"
grep -m1 -i 'in sync' ci.log | sed 's/^/  npm says: /'
cd /work && rm -rf lock

mkdir age && cd age && npm init -y >/dev/null
check "--before installs only versions published by that date" "npm install $Q express --before=2020-01-01 >/dev/null 2>&1 && test \"\$(node -p \"require('express/package.json').version\")\" = 4.17.1"
rm -rf node_modules package-lock.json && node -e "const p=require('./package.json'); delete p.dependencies; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))"
LATEST=$(npm view express version)
npm install $Q express --min-release-age=365 >/dev/null 2>&1
AGED=$(node -p "require('express/package.json').version" 2>/dev/null)
echo "express latest $LATEST, with --min-release-age=365: $AGED"
check "--min-release-age skips versions newer than the cutoff" "test -n \"$AGED\" && test \"$AGED\" != \"$LATEST\""
rm -rf node_modules package-lock.json && node -e "const p=require('./package.json'); delete p.dependencies; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))"
echo 'min-release-age=365' > .npmrc
npm install $Q express >/dev/null 2>&1
check ".npmrc min-release-age=365 applies to every install" "test \"\$(node -p \"require('express/package.json').version\")\" = \"$AGED\""
rm .npmrc
check "npm audit signatures verifies registry signatures" "npm audit signatures 2>&1 | grep -q 'verified registry signature'"
npm audit signatures 2>&1 | grep -i 'verified' | sed 's/^/  /'
cd /work

check "npm view fails for a package that does not exist" "! npm view hd-surely-not-a-real-package-7f3c9 >/dev/null 2>&1"

cd publish-demo
echo "API_KEY=fake-value-for-the-test" > .env
npm pack --dry-run --json 2>/dev/null > pack.json
check "files allowlist publishes index.js" "grep -q '\"path\": \"index.js\"' pack.json"
check "files allowlist keeps .env out of the tarball" "! grep -q '\"path\": \".env\"' pack.json"
