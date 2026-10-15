import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { AuditOutcome } from '@hellodeploy/contracts';
import { AuditEvent } from '@hellodeploy/database';
import {
  configureAuditService,
  resolveProjectId,
  writeAuditEvent,
} from '@hellodeploy/observability';

import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const PROJECT_ID = '6650f0c0a1b2c3d4e5f60718';
const OTHER_ID = '6650f0c0a1b2c3d4e5f60719';

describe('resolveProjectId', () => {
  it('prefers an explicit projectId', () => {
    assert.equal(
      resolveProjectId({ projectId: PROJECT_ID, targetType: 'project', targetId: OTHER_ID }),
      PROJECT_ID,
    );
  });

  it('uses the target when the target is a project', () => {
    assert.equal(resolveProjectId({ targetType: 'project', targetId: PROJECT_ID }), PROJECT_ID);
  });

  it('ignores the target when the target is not a project', () => {
    assert.equal(resolveProjectId({ targetType: 'user', targetId: PROJECT_ID }), null);
  });

  it('falls back to metadata.projectId', () => {
    assert.equal(
      resolveProjectId({
        targetType: 'deployment',
        targetId: OTHER_ID,
        metadata: { projectId: PROJECT_ID },
      }),
      PROJECT_ID,
    );
  });

  it('accepts an ObjectId instance', () => {
    const id = objectId();
    assert.equal(resolveProjectId({ projectId: id }), id.toString());
  });

  it('drops a value that is not an ObjectId', () => {
    assert.equal(resolveProjectId({ targetType: 'project', targetId: 'my-slug' }), null);
  });
});

describe('writeAuditEvent project linking', () => {
  before(async () => {
    await startTestDb();
    configureAuditService(AuditEvent);
  });
  after(async () => {
    configureAuditService(null);
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('stores the project named in metadata', async () => {
    await writeAuditEvent({
      action: 'deployment.created',
      outcome: AuditOutcome.SUCCESS,
      targetType: 'deployment',
      targetId: OTHER_ID,
      metadata: { projectId: PROJECT_ID },
    });

    const event = await AuditEvent.findOne({ action: 'deployment.created' }).lean();
    assert.equal(event.projectId?.toString(), PROJECT_ID);
  });

  it('still writes an event whose project reference is not an ObjectId', async () => {
    await writeAuditEvent({
      action: 'project.updated',
      outcome: AuditOutcome.SUCCESS,
      targetType: 'project',
      targetId: 'my-slug',
    });

    const event = await AuditEvent.findOne({ action: 'project.updated' }).lean();
    assert.equal(event.projectId, null);
  });
});
