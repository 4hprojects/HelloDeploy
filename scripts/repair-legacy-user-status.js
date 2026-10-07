#!/usr/bin/env node

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { UserStatus } from '@hellodeploy/contracts';
import { connectDatabase, disconnectDatabase, User } from '@hellodeploy/database';

export const LEGACY_PASSWORD_USER_FILTER = Object.freeze({
  status: { $exists: false },
  passwordHash: { $type: 'string' },
});

export function validateCliArguments(args) {
  if (
    args.some((arg) => arg !== '--confirm') ||
    args.filter((arg) => arg === '--confirm').length > 1
  ) {
    // Do not echo unknown arguments: a mistakenly supplied URI may contain credentials.
    throw new Error('Unknown or duplicate command argument supplied.');
  }
  return args.includes('--confirm');
}

/**
 * Backfill the lifecycle state used by authentication for password accounts
 * created before User.status existed. Google-only and explicitly classified
 * accounts are deliberately outside this repair.
 */
export async function repairLegacyUserStatuses(
  collection,
  { confirm = false, output = process.stdout } = {},
) {
  const eligibleCount = await collection.countDocuments(LEGACY_PASSWORD_USER_FILTER);
  output.write(`legacy password accounts missing status: ${eligibleCount}\n`);

  if (!confirm) {
    output.write('DRY RUN (pass --confirm to set these accounts to ACTIVE)\n');
    return { eligibleCount, modifiedCount: 0, remainingCount: eligibleCount };
  }

  const result = await collection.updateMany(LEGACY_PASSWORD_USER_FILTER, {
    $set: { status: UserStatus.ACTIVE },
  });
  const remainingCount = await collection.countDocuments(LEGACY_PASSWORD_USER_FILTER);
  output.write(`updated legacy password accounts: ${result.modifiedCount}\n`);
  output.write(`legacy password accounts still missing status: ${remainingCount}\n`);

  if (remainingCount !== 0) {
    throw new Error('Legacy user status repair did not converge.');
  }

  return { eligibleCount, modifiedCount: result.modifiedCount, remainingCount };
}

async function main() {
  const confirm = validateCliArguments(process.argv.slice(2));
  await connectDatabase(process.env.MONGODB_URI);
  try {
    await repairLegacyUserStatuses(User.collection, { confirm });
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
