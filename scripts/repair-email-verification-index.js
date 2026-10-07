#!/usr/bin/env node

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase, disconnectDatabase, User } from '@hellodeploy/database';

export function parseApply(args) {
  if (args.some((arg) => arg !== '--apply') || args.filter((arg) => arg === '--apply').length > 1) {
    throw new Error('Unknown or duplicate command argument supplied.');
  }
  return args.includes('--apply');
}

export async function repairEmailVerificationIndex(
  collection,
  { apply = false, output = process.stdout } = {},
) {
  const indexes = await collection.indexes();
  const unsafe = indexes.filter(
    (index) =>
      index.expireAfterSeconds === 0 &&
      Object.keys(index.key ?? {}).length === 1 &&
      index.key.emailVerificationExpiresAt === 1,
  );
  output.write(`unsafe email-verification TTL indexes: ${unsafe.length}\n`);
  if (!apply) {
    output.write('DRY RUN (pass --apply to drop the exact unsafe index)\n');
    return { found: unsafe.length, dropped: 0 };
  }
  for (const index of unsafe) {
    await collection.dropIndex(index.name);
  }
  output.write(`dropped unsafe email-verification TTL indexes: ${unsafe.length}\n`);
  return { found: unsafe.length, dropped: unsafe.length };
}

async function main() {
  const apply = parseApply(process.argv.slice(2));
  await connectDatabase(process.env.MONGODB_URI);
  try {
    await repairEmailVerificationIndex(User.collection, { apply });
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
