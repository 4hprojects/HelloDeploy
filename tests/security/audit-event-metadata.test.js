import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { AuditEvent } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';
import {
  startApprovalTestDb,
  stopApprovalTestDb,
  clearApprovalTestDb,
} from '../helpers/approval-db.js';

describe('AuditEvent metadata size bound', () => {
  before(async () => {
    await startApprovalTestDb();
  });
  after(async () => {
    await stopApprovalTestDb();
  });
  beforeEach(async () => {
    await clearApprovalTestDb();
  });

  it('accepts metadata within the size bound', async () => {
    await assert.doesNotReject(() =>
      AuditEvent.create({
        action: 'project.created',
        outcome: AuditOutcome.SUCCESS,
        metadata: { projectId: 'abc123' },
      }),
    );
  });

  it('rejects metadata larger than 10,000 serialized characters', async () => {
    await assert.rejects(
      () =>
        AuditEvent.create({
          action: 'project.created',
          outcome: AuditOutcome.SUCCESS,
          metadata: { blob: 'x'.repeat(10_001) },
        }),
      /metadata/,
    );
  });
});
