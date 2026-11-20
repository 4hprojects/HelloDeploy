#!/bin/bash
# Runs inside ubuntu:26.04 with this folder mounted read-only at /src:
#   docker run --rm --memory 768m --cpus 1 -v "$PWD":/src:ro ubuntu:26.04 bash /src/run.sh
# Prints PASS/FAIL lines as evidence for "Backups and Disaster Recovery for Small Self-Hosted Apps".
# The repository is a local folder here; the article uses an SFTP repository as its example.
set -u
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fi; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && apt-get install -y -qq postgresql restic systemd sudo openssl nginx-core >/dev/null 2>&1
. /etc/os-release; echo "$PRETTY_NAME, $(psql --version), $(restic version | cut -d' ' -f1-2)"
service postgresql start >/dev/null 2>&1; sleep 2
P() { sudo -u postgres psql -qtAX "$@"; }
P -c "CREATE DATABASE shop"
P -d shop -c "CREATE TABLE orders (id serial primary key, customer text, total numeric); INSERT INTO orders (customer, total) SELECT 'customer-' || g, g * 1.5 FROM generate_series(1, 5000) g;"
SUM_SQL="SELECT md5(string_agg(id || customer || total, ',' ORDER BY id)) FROM orders"
SUM_BEFORE=$(P -d shop -c "$SUM_SQL")
mkdir -p /srv/myapp/uploads && echo "invoice-marker-7f3a" > /srv/myapp/uploads/invoice-1042.txt
printf '[Service]\nExecStart=/usr/bin/node /srv/myapp/app.js\n' > /etc/systemd/system/myapp.service

# --- Steps exactly as in the article ---
install -d -o postgres -g postgres -m 700 /backup
sudo -u postgres pg_dump -Fc -f /backup/shop.dump shop
sudo -u postgres pg_dumpall --globals-only -f /backup/globals.sql
check "pg_dump writes to the postgres-owned /backup folder" "test -s /backup/shop.dump"
check "pg_dumpall --globals-only writes roles" "grep -q 'CREATE ROLE postgres' /backup/globals.sql"
openssl rand -base64 32 > /root/.restic-password && chmod 600 /root/.restic-password
printf 'export RESTIC_REPOSITORY=/offsite/restic-repo\nexport RESTIC_PASSWORD_FILE=/root/.restic-password\n' > /root/.restic-env && chmod 600 /root/.restic-env
source /root/.restic-env
restic init -q >/dev/null 2>&1
restic backup -q /backup /srv/myapp/uploads /etc/nginx /etc/postgresql /etc/systemd/system/myapp.service >/dev/null 2>&1
check "restic snapshot created" "test \"\$(restic snapshots --json | grep -o '\"id\"' | wc -l)\" = 1"
check "repository does not contain the file contents in plain text" "! grep -rq 'invoice-marker-7f3a' /offsite/restic-repo"
check "wrong password cannot open the repository" "! RESTIC_PASSWORD_FILE=/dev/null RESTIC_PASSWORD=wrong restic snapshots >/dev/null 2>&1"

# --- Restore drill exactly as in the article ---
restic restore latest --target /tmp/restore-drill -q >/dev/null 2>&1
sudo -u postgres createdb shop_restore_test
sudo -u postgres pg_restore -d shop_restore_test < /tmp/restore-drill/backup/shop.dump 2>/tmp/restore.err
check "pg_restore reads the restic-restored dump on stdin" "! test -s /tmp/restore.err"
SUM_AFTER=$(P -d shop_restore_test -c "$SUM_SQL")
check "restored database has 5000 rows" "test \"\$(P -d shop_restore_test -c 'SELECT count(*) FROM orders')\" = 5000"
check "restored data matches the original checksum" "test -n \"$SUM_BEFORE\" && test \"$SUM_BEFORE\" = \"$SUM_AFTER\""
check "restored uploads are identical" "diff -r /srv/myapp/uploads /tmp/restore-drill/srv/myapp/uploads"
rm -rf /tmp/restore-drill && sudo -u postgres dropdb shop_restore_test
check "drill cleanup removes the copy and the test database" "! test -e /tmp/restore-drill && ! P -lqt | cut -d'|' -f1 | grep -qw shop_restore_test"

# --- Retention and integrity ---
for i in 1 2 3; do echo "change $i" >> /srv/myapp/uploads/invoice-1042.txt; restic backup -q /backup /srv/myapp/uploads /etc/nginx /etc/postgresql /etc/systemd/system/myapp.service >/dev/null 2>&1; done
check "four snapshots exist before pruning" "test \"\$(restic snapshots --json | grep -o '\"id\"' | wc -l)\" = 4"
restic forget -q --keep-last 2 --prune >/dev/null 2>&1
check "forget --keep-last 2 --prune leaves two snapshots" "test \"\$(restic snapshots --json | grep -o '\"id\"' | wc -l)\" = 2"
check "restic check passes on a healthy repository" "restic check -q >/dev/null 2>&1"

# --- The scheduled script and units from the article ---
cp /src/backup-app.sh /usr/local/bin/backup-app.sh && chmod 700 /usr/local/bin/backup-app.sh
check "backup script from the article runs successfully" "env -u RESTIC_REPOSITORY -u RESTIC_PASSWORD_FILE /usr/local/bin/backup-app.sh >/tmp/script.log 2>&1"
check "backup script ran restic check" "grep -q 'no errors were found' /tmp/script.log"
cp /src/backup-app.service /src/backup-app.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/backup-app.timer /etc/systemd/system/backup-app.service >/tmp/verify.log 2>&1; VRC=$?
echo "systemd-analyze verify exit $VRC; output lines: $(wc -l < /tmp/verify.log)"; head -3 /tmp/verify.log
check "systemd-analyze verify accepts the timer and service" "test $VRC -eq 0"

# --- Corruption detection (run last; it damages the repository) ---
PACK=$(find /offsite/restic-repo/data -type f | head -1)
printf 'CORRUPT' | dd of="$PACK" bs=1 seek=200 conv=notrunc status=none
restic check >/dev/null 2>&1; DEFAULT_RC=$?
restic check --read-data >/dev/null 2>&1; READ_RC=$?
echo "after corrupting one pack file: restic check exit $DEFAULT_RC, restic check --read-data exit $READ_RC"
check "check --read-data detects the corrupted pack file" "test $READ_RC -ne 0"
