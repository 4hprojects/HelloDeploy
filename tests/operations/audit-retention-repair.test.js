import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { Writable } from 'node:stream';

import { AuditOutcome } from '@hellodeploy/contracts';
import { AUDIT_EVENT_RETENTION_SECONDS, AuditEvent, mongoose } from '@hellodeploy/database';

import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import {
  repairAuditRetention,
  validateCliArguments,
} from '../../scripts/repair-audit-retention.js';

const PROJECT_ID = '6650f0c0a1b2c3d4e5f60718';
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const silent = new Writable({ write: (_chunk, _encoding, done) => done() });

// Raw inserts: events written before AuditEvent.projectId existed.
function insertLegacyEvent(fields) {
  return AuditEvent.collection.insertOne({
    outcome: AuditOutcome.SUCCESS,
    createdAt: new Date(),
    ...fields,
  });
}

async function getTtl() {
  const indexes = await AuditEvent.collection.indexes();
  return indexes.find(
    (index) => index.key?.createdAt === 1 && index.expireAfterSeconds !== undefined,
  )?.expireAfterSeconds;
}

async function setLegacyTtl() {
  await mongoose.connection.db.command({
    collMod: AuditEvent.collection.collectionName,
    index: { keyPattern: { createdAt: 1 }, expireAfterSeconds: SEVEN_DAYS },
  });
}

describe('repairAuditRetention', () => {
  before(async () => {
    await startTestDb();
    await AuditEvent.init();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
    await setLegacyTtl();
  });

  it('links an event whose target is the project', async () => {
    const { insertedId } = await insertLegacyEvent({
      action: 'project.updated',
      targetType: 'project',
      targetId: PROJECT_ID,
    });

    await repairAuditRetention(mongoose.connection.db, { confirm: true, output: silent });

    const event = await AuditEvent.findById(insertedId).lean();
    assert.equal(event.projectId?.toString(), PROJECT_ID);
  });

  it('links an event that names the project in metadata', async () => {
    const { insertedId } = await insertLegacyEvent({
      action: 'deployment.created',
      targetType: 'deployment',
      targetId: '6650f0c0a1b2c3d4e5f60719',
      metadata: { projectId: PROJECT_ID },
    });

    await repairAuditRetention(mongoose.connection.db, { confirm: true, output: silent });

    const event = await AuditEvent.findById(insertedId).lean();
    assert.equal(event.projectId?.toString(), PROJECT_ID);
  });

  it('leaves events without a project unlinked', async () => {
    const { insertedId } = await insertLegacyEvent({
      action: 'auth.sign_in',
      targetType: 'user',
      targetId: PROJECT_ID,
    });

    await repairAuditRetention(mongoose.connection.db, { confirm: true, output: silent });

    const event = await AuditEvent.findById(insertedId).lean();
    assert.equal(event.projectId, undefined);
  });

  it('extends the TTL to the 90-day retention', async () => {
    await repairAuditRetention(mongoose.connection.db, { confirm: true, output: silent });

    assert.equal(await getTtl(), AUDIT_EVENT_RETENTION_SECONDS);
  });

  it('changes nothing on a dry run', async () => {
    await repairAuditRetention(mongoose.connection.db, { output: silent });

    assert.equal(await getTtl(), SEVEN_DAYS);
  });
});

describe('repair-audit-retention CLI arguments', () => {
  it('defaults to a dry run', () => {
    assert.equal(validateCliArguments([]), false);
  });

  it('rejects unknown arguments', () => {
    assert.throws(() => validateCliArguments(['--force']), /Unknown/);
  });
});
