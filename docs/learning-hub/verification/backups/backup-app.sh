#!/bin/bash
# /usr/local/bin/backup-app.sh
set -euo pipefail
source /root/.restic-env

sudo -u postgres pg_dump -Fc -f /backup/shop.dump shop
sudo -u postgres pg_dumpall --globals-only -f /backup/globals.sql
restic backup /backup /srv/myapp/uploads /etc/nginx /etc/postgresql /etc/systemd/system/myapp.service
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check --read-data-subset=5%
