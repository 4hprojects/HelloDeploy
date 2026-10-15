import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import {
  AuditEvent,
  PlatformSetting,
  ProjectMembership,
  StudyAuditEvent,
} from '@hellodeploy/database';
import { AuditOutcome, DeploymentTrigger, ProjectRole } from '@hellodeploy/contracts';

import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { archiveAuditEventsForStudy, buildStudyAuditDocument, AUDIT_STUDY_CURSOR_KEY } =
  await import('../../apps/worker/src/jobs/archive-audit-study.job.js');

const NOW = new Date('2026-10-15T12:00:00Z');
const SETTLED = new Date('2026-10-15T11:00:00Z');
const run = () => archiveAuditEventsForStudy({ now: () => NOW });

function recordEvent(projectId, fields = {}) {
  return AuditEvent.create({
    action: 'project.updated',
    outcome: AuditOutcome.SUCCESS,
    projectId,
    createdAt: SETTLED,
    ...fields,
  });
}

describe('buildStudyAuditDocument', () => {
  it('copies only non-identifying fields', () => {
    const document = buildStudyAuditDocument({
      event: {
        _id: '6650f0c0a1b2c3d4e5f60718',
        action: 'deployment.created',
        outcome: AuditOutcome.SUCCESS,
        actorId: '6650f0c0a1b2c3d4e5f60719',
        sourceIp: '203.0.113.9',
        userAgent: 'Mozilla/5.0',
        targetId: '6650f0c0a1b2c3d4e5f60720',
        createdAt: new Date('2026-10-15T09:41:07Z'),
        metadata: {
          projectId: '6650f0c0a1b2c3d4e5f60721',
          sequenceNumber: 7,
          commitSha: 'abc1234',
          triggerType: DeploymentTrigger.MANUAL,
          hostname: 'app.example.com',
          names: ['STRIPE_KEY'],
        },
      },
      studyProjectKey: 'study-key',
      actorKind: 'member',
      actorProjectRole: ProjectRole.OWNER,
    });

    assert.deepEqual(
      { ...document, studyId: typeof document.studyId },
      {
        studyId: 'string',
        studyProjectKey: 'study-key',
        action: 'deployment.created',
        outcome: AuditOutcome.SUCCESS,
        actorKind: 'member',
        actorProjectRole: ProjectRole.OWNER,
        day: new Date('2026-10-15T00:00:00Z'),
        hourOfDay: 9,
        metadata: { sequenceNumber: 7, triggerType: DeploymentTrigger.MANUAL },
      },
    );
  });

  it('drops a role that is not a project role', () => {
    const document = buildStudyAuditDocument({
      event: {
        _id: '6650f0c0a1b2c3d4e5f60718',
        action: 'project.member_invited',
        outcome: AuditOutcome.SUCCESS,
        createdAt: SETTLED,
        metadata: { role: 'jane@example.com' },
      },
      studyProjectKey: 'study-key',
      actorKind: 'system',
    });

    assert.deepEqual(document.metadata, {});
  });
});

describe('archive-audit-study job', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('archives a settled project event', async () => {
    const project = await createProject();
    await recordEvent(project._id);

    await run();

    assert.equal(await StudyAuditEvent.countDocuments(), 1);
  });

  it('waits for events inside the settle window', async () => {
    const project = await createProject();
    await recordEvent(project._id, { createdAt: new Date('2026-10-15T11:55:00Z') });

    await run();

    assert.equal(await StudyAuditEvent.countDocuments(), 0);
  });

  it('skips events of a deleted project', async () => {
    await recordEvent(objectId());

    await run();

    assert.equal(await StudyAuditEvent.countDocuments(), 0);
  });

  it('does not re-read events behind the cursor', async () => {
    const project = await createProject();
    await recordEvent(project._id);
    await run();

    assert.equal(await run(), 0);
  });

  it('writes one row per event even when the cursor is lost', async () => {
    const project = await createProject();
    await recordEvent(project._id);
    await run();
    await PlatformSetting.deleteOne({ key: AUDIT_STUDY_CURSOR_KEY });

    await run();

    assert.equal(await StudyAuditEvent.countDocuments(), 1);
  });

  it('records a member actor by project role only', async () => {
    const project = await createProject();
    const userId = objectId();
    await ProjectMembership.create({
      projectId: project._id,
      userId,
      role: ProjectRole.MAINTAINER,
    });
    await recordEvent(project._id, { actorId: userId });

    await run();

    const row = await StudyAuditEvent.findOne().lean();
    assert.deepEqual(
      { actorKind: row.actorKind, actorProjectRole: row.actorProjectRole },
      { actorKind: 'member', actorProjectRole: ProjectRole.MAINTAINER },
    );
  });

  it('pages through more events than one batch', async () => {
    const project = await createProject();
    await Promise.all([1, 2, 3].map(() => recordEvent(project._id)));

    const archived = await archiveAuditEventsForStudy({ now: () => NOW, batchSize: 2 });

    assert.equal(archived, 3);
  });
});
