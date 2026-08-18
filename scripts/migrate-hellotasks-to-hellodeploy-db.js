#!/usr/bin/env node
/**
 * One-time migration: copy HelloDeploy's owned collections from the shared
 * `hellotasks` database onto the dedicated `hellodeploy_db` database, both
 * on the same MongoDB Atlas cluster. Never writes to the source database.
 *
 * Background: production's MONGODB_URI has pointed at `hellotasks` (shared
 * with an unrelated app's 6 foreign collections) instead of `hellodeploy_db`
 * since early setup — see docs/PRIORITIES.md's "HIGH — production database
 * is shared with an unrelated application" entry for the full history.
 *
 * Deliberately excludes `sessions` — fully connect-mongo-managed with
 * app-level expiry (apps/web/src/middleware/session.js), not app data, and
 * self-repopulating; users just re-authenticate after cutover.
 *
 * Safe by default: with no flags, only reports what it *would* do via two
 * fresh, read-only connections — zero writes. Pass --confirm to actually
 * clear and copy. Idempotent either way (clears each destination
 * collection before copying), so it's safe to re-run, e.g. right before
 * the cutover, to catch any last-minute writes to the source.
 *
 * Usage:
 *   SOURCE_MONGODB_URI=... DEST_MONGODB_URI=... node scripts/migrate-hellotasks-to-hellodeploy-db.js [--confirm]
 */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  connectDatabase,
  disconnectDatabase,
  mongoose,
  User,
  AuditEvent,
  Project,
  ProjectMembership,
  Quota,
  ApprovalRequest,
  Repository,
  EnvironmentSecret,
  Deployment,
  DeploymentEvent,
  Domain,
  PlatformSetting,
} from '@hellodeploy/database';

const required = (name) => {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`Missing required env var: ${name}\n`);
    process.exit(1);
  }
  return v;
};

export function parseDatabaseIdentity(uri) {
  const match = String(uri).match(/^(mongodb(?:\+srv)?):\/\/([^/]+)\/([^?]+)(?:\?.*)?$/i);
  if (!match) {
    throw new Error('MongoDB URI must include an explicit database name.');
  }

  const authority = match[2].slice(match[2].lastIndexOf('@') + 1).toLowerCase();
  const database = decodeURIComponent(match[3]).trim();
  if (!authority || !database) {
    throw new Error('MongoDB URI must include a server and database name.');
  }

  return { server: `${match[1].toLowerCase()}://${authority}`, database };
}

export function assertDistinctDatabaseTargets(sourceUri, destUri) {
  const source = parseDatabaseIdentity(sourceUri);
  const destination = parseDatabaseIdentity(destUri);
  if (source.server === destination.server && source.database === destination.database) {
    throw new Error('Source and destination must be different MongoDB databases.');
  }
  return { source, destination };
}

// Mongo collection name -> the real mongoose model. On a real run, connecting
// these models against the destination creates each model's current indexes
// as a side effect, instead of hand-copying index specs that can drift.
const OWNED_COLLECTIONS = [
  ['approval_requests', ApprovalRequest],
  ['audit_events', AuditEvent],
  ['deployment_events', DeploymentEvent],
  ['deployments', Deployment],
  ['domains', Domain],
  ['environment_secrets', EnvironmentSecret],
  ['platform_settings', PlatformSetting],
  ['project_memberships', ProjectMembership],
  ['projects', Project],
  ['quotas', Quota],
  ['repositories', Repository],
  ['users', User],
];

const REFERENCE_CHECKS = [
  ['approval_requests', 'projectId', 'projects'],
  ['approval_requests', 'requestedBy', 'users'],
  ['approval_requests', 'reviewedBy', 'users'],
  ['audit_events', 'actorId', 'users'],
  ['deployment_events', 'deploymentId', 'deployments'],
  ['deployments', 'projectId', 'projects'],
  ['deployments', 'requestedBy', 'users'],
  ['deployments', 'sourceDeploymentId', 'deployments'],
  ['domains', 'projectId', 'projects'],
  ['domains', 'approvedBy', 'users'],
  ['domains', 'addedBy', 'users'],
  ['environment_secrets', 'projectId', 'projects'],
  ['environment_secrets', 'createdBy', 'users'],
  ['environment_secrets', 'updatedBy', 'users'],
  ['platform_settings', 'updatedBy', 'users'],
  ['project_memberships', 'projectId', 'projects'],
  ['project_memberships', 'userId', 'users'],
  ['project_memberships', 'invitedBy', 'users'],
  ['projects', 'ownerId', 'users'],
  ['projects', 'repositoryId', 'repositories'],
  ['projects', 'activeDeploymentId', 'deployments'],
  ['projects', 'quotaOverrideId', 'quotas'],
  ['quotas', 'createdBy', 'users'],
  ['repositories', 'projectId', 'projects'],
];

const POLYMORPHIC_REFERENCE_CHECKS = [
  ['quotas', 'scopeId', 'users', { scopeType: 'USER' }],
  ['quotas', 'scopeId', 'projects', { scopeType: 'PROJECT' }],
];

async function collectionIds(collection) {
  return (await collection.find({}, { projection: { _id: 1 } }).toArray())
    .map(({ _id }) => _id.toString())
    .sort();
}

async function countOrphans(
  connection,
  collectionName,
  fieldName,
  targetCollectionName,
  filter = {},
) {
  const values = await connection
    .collection(collectionName)
    .distinct(fieldName, { ...filter, [fieldName]: { $ne: null } });
  if (values.length === 0) {
    return 0;
  }
  const existing = await connection
    .collection(targetCollectionName)
    .countDocuments({ _id: { $in: values } });
  return values.length - existing;
}

async function reconcileDestinationIndexes() {
  for (const [collectionName, Model] of OWNED_COLLECTIONS) {
    await Model.syncIndexes();
    const diff = await Model.diffIndexes();
    const indexMatch = diff.toDrop.length === 0 && diff.toCreate.length === 0;
    process.stdout.write(`${collectionName}: expectedIndexes=${indexMatch}\n`);
    if (!indexMatch) {
      throw new Error(`Destination indexes did not converge for ${collectionName}.`);
    }
  }
}

async function dryRun({ sourceUri, destUri }) {
  assertDistinctDatabaseTargets(sourceUri, destUri);
  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  const destConn = await mongoose.createConnection(destUri).asPromise();
  process.stdout.write('source and destination: distinct\n');
  process.stdout.write('sessions: excluded; users must reauthenticate after cutover\n');

  try {
    for (const [collectionName] of OWNED_COLLECTIONS) {
      const sourceCount = await sourceConn.collection(collectionName).countDocuments();
      const destCount = await destConn.collection(collectionName).countDocuments();
      process.stdout.write(
        `${collectionName}: would clear ${destCount} existing doc(s), copy ${sourceCount} doc(s) from source\n`,
      );
    }
  } finally {
    await sourceConn.close();
    await destConn.close();
  }
}

async function realRun({ sourceUri, destUri }) {
  assertDistinctDatabaseTargets(sourceUri, destUri);
  // Primary connection: hellodeploy_db, via the real models imported above —
  // mongoose creates each model's current indexes as a side effect of this
  // connection, fixing the stale-index gap found during planning.
  await connectDatabase(destUri);
  process.stdout.write('destination: connected\n');

  // Secondary, read-only connection: hellotasks. Never write through this.
  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  process.stdout.write('source: connected read-only by migration convention\n');
  process.stdout.write('sessions: excluded; users must reauthenticate after cutover\n');

  try {
    for (const [collectionName, Model] of OWNED_COLLECTIONS) {
      const sourceDocs = await sourceConn.collection(collectionName).find({}).toArray();
      await Model.collection.deleteMany({});
      if (sourceDocs.length > 0) {
        await Model.collection.insertMany(sourceDocs, { ordered: true });
      }
      const destCount = await Model.collection.countDocuments();
      process.stdout.write(
        `${collectionName}: copied ${sourceDocs.length}, dest now has ${destCount}\n`,
      );
    }

    process.stdout.write('--- destination index reconciliation ---\n');
    await reconcileDestinationIndexes();

    process.stdout.write('--- verification ---\n');
    let allOk = true;
    for (const [collectionName, Model] of OWNED_COLLECTIONS) {
      const sourceCount = await sourceConn.collection(collectionName).countDocuments();
      const destCount = await Model.collection.countDocuments();
      const countMatch = sourceCount === destCount;
      const sourceIds = await collectionIds(sourceConn.collection(collectionName));
      const destIds = await collectionIds(Model.collection);
      const identityMatch = JSON.stringify(sourceIds) === JSON.stringify(destIds);
      if (!countMatch || !identityMatch) {
        allOk = false;
      }
      process.stdout.write(
        `${collectionName}: countMatch=${countMatch} (${sourceCount}/${destCount}) identityMatch=${identityMatch}\n`,
      );
    }

    for (const [collectionName, fieldName, targetCollectionName, filter] of [
      ...REFERENCE_CHECKS,
      ...POLYMORPHIC_REFERENCE_CHECKS,
    ]) {
      const orphanCount = await countOrphans(
        mongoose.connection,
        collectionName,
        fieldName,
        targetCollectionName,
        filter,
      );
      const referencesValid = orphanCount === 0;
      if (!referencesValid) {
        allOk = false;
      }
      process.stdout.write(
        `${collectionName}.${fieldName}: referencesValid=${referencesValid} orphanCount=${orphanCount}\n`,
      );
    }
    process.stdout.write(allOk ? 'PARITY OK\n' : 'PARITY MISMATCH — see rows above\n');
    if (!allOk) {
      process.exitCode = 1;
    }
  } finally {
    await sourceConn.close();
    await disconnectDatabase();
  }
}

async function main() {
  const shouldConfirm = validateCliArguments(process.argv.slice(2));
  const sourceUri = required('SOURCE_MONGODB_URI');
  const destUri = required('DEST_MONGODB_URI');

  if (!shouldConfirm) {
    process.stdout.write('DRY RUN (pass --confirm to actually clear + copy)\n');
    await dryRun({ sourceUri, destUri });
    return;
  }

  await realRun({ sourceUri, destUri });
}

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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
