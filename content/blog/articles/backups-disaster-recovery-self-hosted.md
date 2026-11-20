---
id: lh-backups-disaster-recovery
slug: backups-disaster-recovery-self-hosted
title: Backups and Disaster Recovery for Small Self-Hosted Apps
description: Decide how much data and downtime you can afford to lose, back up databases and files to encrypted off-site storage, and prove it with a restore drill.
category: self-hosting
tags: [backups, disaster-recovery, postgresql, restic, self-hosting]
authorId: henson-sagorsor
status: draft
publishedAt: '2026-11-20'
difficulty: beginner
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/backups-disaster-recovery-self-hosted.png
testedEnvironment:
  summary: >-
    Every command in the database, restic, retention, restore drill, and script sections was run as
    root in a disposable ubuntu:26.04 Docker container with PostgreSQL 18.6 and restic 0.18.1 from
    the Ubuntu archive, using a local folder in place of the SFTP repository. The restored database
    matched the original checksum, and the timer and service units passed systemd-analyze verify.
    MongoDB, SFTP and cloud repositories, object lock, append-only servers, and a timer firing on
    schedule were not tested.
  verifiedAt: '2026-11-21'
references:
  - title: NIST SP 800-34 Rev. 1 — Contingency Planning Guide for Federal Information Systems
    url: https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final
  - title: 'CISA — #StopRansomware Guide (September 2023)'
    url: https://www.cisa.gov/stopransomware/ransomware-guide
  - title: PostgreSQL — SQL Dump (pg_dump and pg_restore)
    url: https://www.postgresql.org/docs/current/backup-dump.html
  - title: MongoDB — Back Up and Restore with MongoDB Tools
    url: https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/
  - title: restic documentation
    url: https://restic.readthedocs.io/en/latest/
  - title: restic — Removing backup snapshots (forget and prune)
    url: https://restic.readthedocs.io/en/latest/060_forget.html
  - title: restic — Working with repositories (check)
    url: https://restic.readthedocs.io/en/latest/045_working_with_repos.html
---

Every self-hosted app will eventually lose something: a disk fails, an update corrupts the database, someone runs a delete against the wrong server, or ransomware encrypts everything it can reach. Whether that costs you an evening or the whole project depends on decisions you make now, while nothing is broken.

This guide walks through those decisions for a small app, such as a Node.js site with a PostgreSQL database and some uploaded files, and then shows a tested backup and restore routine you can copy. The most important part is the last one: a backup you have never restored is only a hope.

## What you will learn

By the end of this guide you should be able to:

- **Define** recovery point and recovery time objectives for your app, and explain why they drive every other choice.
- **Identify** what needs backing up, and what can be rebuilt instead.
- **Create** consistent database backups and encrypted, off-site file backups with a retention policy.
- **Protect** backups from the same failures and attacks that hit your server.
- **Run** a restore drill and verify that the restored data is complete.

## Before you begin

You should be comfortable with a Linux terminal and know where your app keeps its data. The examples use PostgreSQL, restic (an open-source backup program), and an app installed in `/srv/myapp`, as in [How to Secure Nginx and Node.js Applications on Ubuntu](/blog/secure-nginx-nodejs-ubuntu). Install the tools with `sudo apt install restic` if needed.

The commands are written for a root shell: start one with `sudo -i`. Practice on a test server or a copy of your data, and never restore over production.

## Backups are not the same as redundancy

Several things feel like backups but are not:

- **RAID or a database replica** keeps a second copy in step with the first. If you delete a table or ransomware encrypts files, the change is copied too.
- **A snapshot on the same disk or account** disappears with that disk or account.
- **A copy in the same building** burns, floods, or is stolen with the server.

A backup is a separate copy, from a known point in time, stored somewhere a failure or attacker on your server cannot easily reach.

## Decide what you can afford to lose

NIST's contingency planning guide, SP 800-34, defines the two numbers that shape a backup plan:

- **Recovery Point Objective (RPO):** the point in time before an outage to which data can be recovered, given the most recent backup. In practice: **how much recent data you can afford to lose.** Nightly backups mean an RPO of up to 24 hours.
- **Recovery Time Objective (RTO):** the maximum time a system can stay unavailable before the impact becomes unacceptable. In practice: **how long a restore may take.**

NIST also uses **Maximum Tolerable Downtime (MTD)**, the total outage the owner is willing to accept; your RTO must fit inside it.

Write down your answers before choosing tools. For a hobby blog, an RPO of a day and an RTO of a weekend may be fine. For a small shop taking orders, losing a day of orders may be unacceptable, which means backing up more often or using your database's continuous archiving features.

## What to back up

| Data                                        | Back up?                      | How                                               |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------- |
| Database                                    | Yes, the most important       | A consistent logical dump, as shown below         |
| User uploads and generated files            | Yes                           | File backup                                       |
| Configuration (Nginx, PostgreSQL, systemd)  | Yes, small and easy to forget | File backup, or keep in a private Git repository  |
| Secrets (`.env`, keys, the backup password) | Yes, but separately           | Encrypted, in a password manager or secrets store |
| Application code                            | Usually already in Git        | Make sure the Git host is not your only copy      |
| `node_modules`, build output, caches        | No                            | Rebuilt from the lockfile and source              |

Also write down what is needed to rebuild the server itself: the operating system version, packages, firewall rules, and DNS settings. A rebuild checklist turns a dead disk into an inconvenience.

## Keep copies in more than one place

A widely used rule of thumb is **3-2-1**: keep at least three copies of your data, on two different kinds of storage, with one copy off-site. For a small app, that might be the live database, a nightly dump on the server, and an encrypted copy on another machine or in cloud storage.

Ransomware adds a requirement. CISA's #StopRansomware Guide warns that many ransomware variants try to find and delete or encrypt accessible backups, and recommends maintaining **offline, encrypted backups** of critical data and regularly testing their availability and integrity. For a small setup, that means at least one copy the server cannot modify or delete:

- storage with **object lock** or retention rules, which some cloud providers offer, or **versioning** combined with credentials that cannot delete old versions;
- a backup server that accepts new data but refuses deletions, such as restic's companion `rest-server` started with `--append-only`;
- or a periodic copy to a disk you disconnect afterwards.

## Back up the database consistently

Copying a database's files while it is running can produce a backup that will not start. Use the database's own dump tool instead.

Create a folder for dumps that only the `postgres` user can read; dumps are not encrypted, so these permissions matter:

```bash
install -d -o postgres -g postgres -m 700 /backup
```

Then dump the database in PostgreSQL's custom format (`-Fc`), which is compressed and restored with `pg_restore`:

```bash
sudo -u postgres pg_dump -Fc -f /backup/shop.dump shop
```

The PostgreSQL documentation notes that `pg_dump` produces a consistent snapshot without blocking other operations, so the app keeps running. Operations that need an exclusive lock, such as most `ALTER TABLE` statements, do wait for it, so avoid running migrations during the backup.

`pg_dump` covers one database. Users and their passwords are stored cluster-wide, so dump them separately:

```bash
sudo -u postgres pg_dumpall --globals-only -f /backup/globals.sql
```

That file contains roles and password hashes, which is one more reason to keep `/backup` private. It does not include PostgreSQL's configuration files, so back up `/etc/postgresql` with your other files.

For MongoDB, the `mongodump` and `mongorestore` tools are described in MongoDB's documentation as useful for small deployments. On a replica set, dump the whole instance with `--oplog` so writes made during the dump are captured, and restore with `mongorestore --oplogReplay`. For larger systems, MongoDB recommends file system or block-level snapshots.

## Store encrypted copies off the server with restic

restic backs up files into a **repository**, which can be another server over SFTP, a REST server, or cloud storage. Everything stored in it is encrypted, so whoever runs the storage cannot read your data.

Create a strong password and a small settings file that only root can read:

```bash
openssl rand -base64 32 > /root/.restic-password
chmod 600 /root/.restic-password

cat > /root/.restic-env <<'END'
export RESTIC_REPOSITORY=sftp:backup@backup-host:/srv/restic/myapp
export RESTIC_PASSWORD_FILE=/root/.restic-password
END
chmod 600 /root/.restic-env
```

Replace the repository with your own; the test used a local folder in its place. Then create the repository and run the first backup:

```bash
source /root/.restic-env
restic init
restic backup /backup /srv/myapp/uploads /etc/nginx /etc/postgresql /etc/systemd/system/myapp.service
```

In the test, a marker string from a backed-up file could not be found anywhere in the repository, and opening it with the wrong password failed.

**Copy the password to a password manager or another safe place off the server.** Without it, nobody can read the backups, including you.

Repeated backups store only data that changed, which keeps file backups small. Compressed database dumps change almost entirely each night, so expect each dump to add close to its full size.

### Keep a sensible history

Without a retention policy, backups grow forever; with too short a one, you may only discover a problem after the last good copy is gone. restic's `forget` command selects which snapshots to keep, and `--prune` removes data no longer needed:

```bash
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

That keeps a week of daily snapshots, a month of weekly ones, and six monthly ones. restic applies the policy separately to each combination of host and backed-up paths. In the test, `forget --keep-last 2 --prune` reduced four snapshots to two. Use `--dry-run` first to see what would be removed.

restic's documentation is explicit that restic itself is not designed to protect against an attacker deleting files at the storage location; that protection has to come from the storage, as described above. Pruning needs delete rights, so if your server's access is append-only, run `forget --prune` from a separate, trusted machine instead.

### Check that backups are readable

`restic check` verifies the repository's structure. By default it does not read every data file; `--read-data` does, and `--read-data-subset=5%` reads a random sample, which is cheaper on cloud storage:

```bash
restic check --read-data-subset=5%
```

In the test, one data file was deliberately damaged. `restic check --read-data` reported the error and exited with a failure code; in this case the default check caught it too, but damage inside file contents may only show up when the data is read.

## Automate it

A backup you have to remember to run will stop running. A small script and a systemd timer are enough:

```bash
#!/bin/bash
# /usr/local/bin/backup-app.sh
set -euo pipefail
source /root/.restic-env

sudo -u postgres pg_dump -Fc -f /backup/shop.dump shop
sudo -u postgres pg_dumpall --globals-only -f /backup/globals.sql
restic backup /backup /srv/myapp/uploads /etc/nginx /etc/postgresql /etc/systemd/system/myapp.service
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check --read-data-subset=5%
```

```ini
# /etc/systemd/system/backup-app.service
[Unit]
Description=Back up the app database and files

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup-app.sh
```

```ini
# /etc/systemd/system/backup-app.timer
[Unit]
Description=Nightly app backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Make the script executable by root only (`chmod 700`), then enable the timer with `systemctl daemon-reload` and `systemctl enable --now backup-app.timer`. Check results with `systemctl list-timers` and `journalctl -u backup-app`. In the test, the script ran successfully by hand and both units passed `systemd-analyze verify`; the timer firing on schedule was not tested.

`set -euo pipefail` makes the script stop at the first failure. Make sure a failure reaches you too, for example through an external monitoring service that alerts when an expected "backup finished" check-in does not arrive. If your repository is append-only, remove the `forget` line here and run it from the trusted machine.

## Run a restore drill

This is the step most people skip, and the one that matters. At least every few months, and after any change to your setup, restore into a separate place and check the result:

1. **Restore the files** from the latest snapshot into an empty directory:

   ```bash
   source /root/.restic-env
   restic restore latest --target /tmp/restore-drill
   ```

2. **Restore the database** into a new, empty database, never over production. restic creates the restore folder readable by root only, so pass the dump to `pg_restore` on standard input:

   ```bash
   sudo -u postgres createdb shop_restore_test
   sudo -u postgres pg_restore -d shop_restore_test < /tmp/restore-drill/backup/shop.dump
   ```

   On a fresh server, first recreate the roles with `sudo -u postgres psql -f globals.sql`, or add `--no-owner` to `pg_restore`.

3. **Verify the data**, not just the exit code. Compare row counts, or a checksum of important tables, against production at the time of the backup. Open a few restored uploads.
4. **Time it**, and compare the total with your RTO. Include the time to find the password and remember the steps.
5. **Clean up**, because the drill copy contains real data:

   ```bash
   rm -rf /tmp/restore-drill
   sudo -u postgres dropdb shop_restore_test
   ```

6. **Write down what went wrong** and fix the runbook.

In the test, the database restored from the restic copy had all 5,000 rows, its checksum matched the original, and the restored uploads were identical.

## Write a one-page recovery plan

When something breaks, you will be stressed and in a hurry. A single page, stored outside the server, should answer:

- Where are the backups, and how do I access them? Where is the restic password?
- What is the restore order: server, database roles, database, files, configuration, DNS?
- Which commands restore each part?
- Who needs to be told, and how?
- When was the last successful restore drill?

## Common mistakes and misconceptions

- **"We have RAID, so we have backups."** Redundancy copies mistakes and ransomware too.
- **"The backup job runs every night."** Check that it succeeds, and restore from it regularly.
- **Keeping the only off-site copy deletable from the server.** Ransomware or an attacker with your server's credentials can delete it.
- **Storing the backup password on the server only.** If the server is lost, the backups are unreadable.
- **Backing up only the database.** Uploads, configuration, roles, and secrets are needed to bring the app back.

## Check your understanding

Try to answer each question before reading the answers below.

1. Your backups run nightly at 03:00. The database is corrupted at 22:00. Roughly how much data could you lose, and which objective is this?
2. Why is a live database replica not a backup?
3. Your server's backup script uses cloud credentials that can delete objects in the bucket. Why is that a problem, and what are two fixes?
4. Your nightly backup job reports success. What is the only way to know you can recover?

**Answers**

1. Up to about 19 hours of changes, everything since 03:00. That is your recovery point objective (RPO).
2. It copies every change, including accidental deletions and encrypted files, almost immediately.
3. Ransomware or an attacker on the server could delete the backups too. Use object lock or retention rules on the bucket, or credentials that can only add backups, and run pruning from a separate trusted machine.
4. Restore from it into a separate environment and verify the data.

## Key takeaways

- Decide your RPO and RTO first; they determine how often you back up and how fast you must restore.
- Back up the database with its own dump tools, plus files, configuration, and secrets.
- Keep an encrypted copy off the server that the server cannot delete.
- Automate backups, apply a retention policy, check repositories, and alert on failure.
- A restore drill is the only proof that your backups work.

## Related guides

- [How to Host a Website on an Old Laptop Using Ubuntu](/blog/host-website-old-laptop-ubuntu)
- [Self-Hosting vs Cloud Hosting: Costs, Benefits and Limitations](/blog/self-hosting-vs-cloud-hosting)
- [How to Secure Nginx and Node.js Applications on Ubuntu](/blog/secure-nginx-nodejs-ubuntu)
