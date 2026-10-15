#!/usr/bin/env node

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  AUDIT_EVENT_RETENTION_SECONDS,
  connectDatabase,
  disconnectDatabase,
  AuditEvent,
} from '@hellodeploy/database';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
const UNLINKED = { $in: [null] }; // matches null and missing

// Same precedence as resolveProjectId in @hellodeploy/observability: a project
// target first, then metadata.projectId.
export const BACKFILL_SOURCES = Object.freeze([
  {
    label: 'project targets',
    filter: { projectId: UNLINKED, targetType: 'project', targetId: { $regex: OBJECT_ID_REGEX } },
    source: '$targetId',
  },
  {
    label: 'metadata.projectId',
    filter: { projectId: UNLINKED, 'metadata.projectId': { $regex: OBJECT_ID_REGEX } },
    source: '$metadata.projectId',
  },
]);

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
 * Bring audit_events up to the per-project audit log: link events written
 * before AuditEvent.projectId existed to their project, then move the
 * createdAt TTL from 7 to 90 days (Mongoose never alters an existing TTL
 * index). The backfill runs first so it still lands if the index change fails.
 */
export async function repairAuditRetention(db, { confirm = false, output = process.stdout } = {}) {
  const collection = db.collection(AuditEvent.collection.collectionName);

  const indexes = await collection.indexes();
  const ttlIndex = indexes.find(
    (index) => index.expireAfterSeconds !== undefined && index.key?.createdAt === 1,
  );
  const currentTtl = ttlIndex?.expireAfterSeconds ?? null;
  output.write(`audit TTL: ${currentTtl ?? 'none'} -> ${AUDIT_EVENT_RETENTION_SECONDS} seconds\n`);

  for (const { label, filter } of BACKFILL_SOURCES) {
    const count = await collection.countDocuments(filter);
    output.write(`events to link from ${label}: ${count}\n`);
  }

  if (!confirm) {
    output.write('DRY RUN (pass --confirm to apply)\n');
    return { previousTtl: currentTtl, linkedCount: 0 };
  }

  let linkedCount = 0;
  for (const { label, filter, source } of BACKFILL_SOURCES) {
    const result = await collection.updateMany(filter, [
      { $set: { projectId: { $toObjectId: source } } },
    ]);
    linkedCount += result.modifiedCount;
    output.write(`linked from ${label}: ${result.modifiedCount}\n`);
  }

  for (const { label, filter } of BACKFILL_SOURCES) {
    if ((await collection.countDocuments(filter)) !== 0) {
      throw new Error(`Audit projectId backfill did not converge for ${label}.`);
    }
  }

  // No TTL index yet means Mongoose will create it at the new value on startup.
  // Drop and recreate rather than collMod: Atlas's readWrite role, which the
  // app's database user has, allows index changes but not collMod. Until the
  // new index exists nothing expires, which only delays deletion.
  if (ttlIndex && currentTtl !== AUDIT_EVENT_RETENTION_SECONDS) {
    await collection.dropIndex(ttlIndex.name);
    await collection.createIndex(
      { createdAt: 1 },
      { name: ttlIndex.name, expireAfterSeconds: AUDIT_EVENT_RETENTION_SECONDS },
    );
    output.write('updated audit TTL\n');
  }

  return { previousTtl: currentTtl, linkedCount };
}

async function main() {
  const confirm = validateCliArguments(process.argv.slice(2));
  await connectDatabase(process.env.MONGODB_URI);
  try {
    await repairAuditRetention(AuditEvent.db.db, { confirm });
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
