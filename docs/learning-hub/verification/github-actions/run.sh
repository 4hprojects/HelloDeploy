#!/bin/bash
# Runs inside python:3.13-slim with this folder mounted read-only at /src:
#   docker run --rm --memory 768m --cpus 1 -v "$PWD":/src:ro python:3.13-slim bash /src/run.sh
# Prints PASS/FAIL lines as evidence for "GitHub Actions Security: How to Protect Your Deployment Pipeline".
set -u
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
pip install --quiet --root-user-action=ignore zizmor >/dev/null 2>&1
apt-get update -qq >/dev/null && apt-get install -y -qq curl >/dev/null 2>&1
curl -sSL -o /tmp/al.tgz https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz && tar -xzf /tmp/al.tgz -C /usr/local/bin actionlint
echo "zizmor $(zizmor --version | cut -d' ' -f2) actionlint $(actionlint -version | head -1)"
cp -r /src /work && cd /work
actionlint risky/triage.yml > risky-actionlint.txt 2>&1
actionlint safer/triage.yml > safer-actionlint.txt 2>&1
zizmor --offline risky/triage.yml > risky-zizmor.txt 2>&1
zizmor --offline safer/triage.yml > safer-zizmor.txt 2>&1
echo "--- actionlint, risky workflow"; cat risky-actionlint.txt
echo "--- zizmor, risky workflow (rule names)"; grep -oE '^(error|warning|help|info)\[[a-z-]+\]' risky-zizmor.txt | sort | uniq -c
echo "--- zizmor, safer workflow"; tail -3 safer-zizmor.txt
check "actionlint flags the PR title injection" "grep -q 'github.event.pull_request.title' risky-actionlint.txt"
check "actionlint passes the safer workflow" "! test -s safer-actionlint.txt"
check "zizmor flags template injection" "grep -q 'template-injection' risky-zizmor.txt"
check "zizmor flags pull_request_target" "grep -qE 'dangerous-triggers' risky-zizmor.txt"
zizmor --offline --persona=pedantic risky/triage.yml > risky-zizmor-pedantic.txt 2>&1
check "zizmor --persona=pedantic flags write-all permissions" "grep -qE 'excessive-permissions' risky-zizmor-pedantic.txt"
check "zizmor flags the unpinned action" "grep -qE 'unpinned-uses' risky-zizmor.txt"
check "zizmor flags persisted checkout credentials" "grep -qE 'artipacked' risky-zizmor.txt"
check "zizmor finds no template injection in the safer workflow" "! grep -q 'template-injection' safer-zizmor.txt"
check "zizmor finds no dangerous trigger in the safer workflow" "! grep -q 'dangerous-triggers' safer-zizmor.txt"
check "zizmor finds no unpinned action in the safer workflow" "! grep -q 'unpinned-uses' safer-zizmor.txt"
