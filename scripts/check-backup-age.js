#!/usr/bin/env node
import 'dotenv/config';

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BACKUP_ROOT = '/var/backups/hellodeploy';
const DEFAULT_MAX_AGE_HOURS = 48;

/**
 * Age of the newest backup archive, in hours, or null when there is none.
 *
 * A silently failing backup is indistinguishable from a working one until a
 * restore is attempted, which is the worst possible moment to find out.
 */
export async function findNewestBackupAgeHours(backupRoot, now = Date.now()) {
  let entries;
  try {
    entries = await readdir(backupRoot);
  } catch {
    return null;
  }

  let newest = null;
  for (const entry of entries) {
    if (!entry.endsWith('.tar.gz') && !entry.endsWith('.tar.gz.gpg')) {
      continue;
    }
    try {
      const info = await stat(join(backupRoot, entry));
      if (newest === null || info.mtimeMs > newest) {
        newest = info.mtimeMs;
      }
    } catch {
      // Raced with a rotation; the other entries still answer the question.
    }
  }

  return newest === null ? null : (now - newest) / 3_600_000;
}

export function formatBackupAgeLine(ageHours, maxAgeHours) {
  if (ageHours === null) {
    return `backup_age=none status=failed max_age_hours=${maxAgeHours}`;
  }
  const status = ageHours > maxAgeHours ? 'failed' : 'passed';
  return `backup_age_hours=${ageHours.toFixed(1)} status=${status} max_age_hours=${maxAgeHours}`;
}

async function main() {
  const rootArg = process.argv.indexOf('--root');
  const maxArg = process.argv.indexOf('--max-age-hours');
  const backupRoot =
    rootArg === -1
      ? (process.env.HELLODEPLOY_BACKUP_ROOT ?? DEFAULT_BACKUP_ROOT)
      : process.argv[rootArg + 1];
  const maxAgeHours = maxArg === -1 ? DEFAULT_MAX_AGE_HOURS : Number(process.argv[maxArg + 1]);

  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    process.stderr.write(
      'Usage: node scripts/check-backup-age.js [--root <dir>] [--max-age-hours <n>]\n',
    );
    process.exitCode = 1;
    return;
  }

  const ageHours = await findNewestBackupAgeHours(backupRoot);
  process.stdout.write(`${formatBackupAgeLine(ageHours, maxAgeHours)}\n`);

  if (ageHours === null || ageHours > maxAgeHours) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
