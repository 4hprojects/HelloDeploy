import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import {
  AuditOutcome,
  DeploymentTrigger,
  PlatformRole,
  ProjectRole,
  UserStatus,
} from '@hellodeploy/contracts';
import { AuditEvent, ProjectMembership, User } from '@hellodeploy/database';

import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { searchProjectActivity, getProjectActivityActors } =
  await import('../../apps/web/src/services/audit-search.service.js');

let emailCounter = 0;

function createUser(overrides = {}) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `user-${++emailCounter}@example.com`,
    passwordHash: 'x',
    platformRole: PlatformRole.USER,
    status: UserStatus.ACTIVE,
    ...overrides,
  });
}

function recordEvent(projectId, fields = {}) {
  return AuditEvent.create({
    action: 'project.updated',
    outcome: AuditOutcome.SUCCESS,
    projectId,
    ...fields,
  });
}

async function actorLabelFor(projectId, actorId) {
  await recordEvent(projectId, { actorId });
  const { events } = await searchProjectActivity(projectId);
  return events[0].actorLabel;
}

describe('searchProjectActivity', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it("never returns another project's events", async () => {
    const projectId = objectId();
    await recordEvent(objectId(), { action: 'project.secret_set' });

    const { total } = await searchProjectActivity(projectId);

    assert.equal(total, 0);
  });

  it('narrows to secret events with the secrets category', async () => {
    const projectId = objectId();
    await recordEvent(projectId, { action: 'project.secret_set' });
    await recordEvent(projectId, { action: 'project.member_added' });

    const { events } = await searchProjectActivity(projectId, { category: 'secrets' });

    assert.deepEqual(
      events.map((e) => e.action),
      ['project.secret_set'],
    );
  });

  it('keeps secret and member events out of the project settings category', async () => {
    const projectId = objectId();
    await recordEvent(projectId, { action: 'project.secret_set' });
    await recordEvent(projectId, { action: 'project.member_added' });
    await recordEvent(projectId, { action: 'project.build_filters_updated' });

    const { events } = await searchProjectActivity(projectId, { category: 'project' });

    assert.deepEqual(
      events.map((e) => e.action),
      ['project.build_filters_updated'],
    );
  });

  it('includes the whole of the "to" day', async () => {
    const projectId = objectId();
    await recordEvent(projectId, { createdAt: new Date('2026-10-15T23:30:00Z') });

    const { total } = await searchProjectActivity(projectId, { to: '2026-10-15' });

    assert.equal(total, 1);
  });

  it('matches nothing for a malformed actor id', async () => {
    const projectId = objectId();
    await recordEvent(projectId);

    const { total } = await searchProjectActivity(projectId, { actorId: 'not-an-id' });

    assert.equal(total, 0);
  });

  it('names a current member by name only', async () => {
    const projectId = objectId();
    const user = await createUser();
    await ProjectMembership.create({ projectId, userId: user._id, role: ProjectRole.MAINTAINER });

    assert.equal(await actorLabelFor(projectId, user._id), 'Ada Lovelace');
  });

  it('hides the name of someone no longer on the project', async () => {
    const projectId = objectId();
    const user = await createUser();

    assert.equal(await actorLabelFor(projectId, user._id), 'Former member');
  });

  it('shows a platform admin as HelloDeploy admin', async () => {
    const projectId = objectId();
    const admin = await createUser({ platformRole: PlatformRole.ADMIN });

    assert.equal(await actorLabelFor(projectId, admin._id), 'HelloDeploy admin');
  });

  it('names a push deploy after its trigger', async () => {
    const projectId = objectId();
    await recordEvent(projectId, {
      action: 'deployment.created',
      metadata: { triggerType: DeploymentTrigger.AUTOMATIC },
    });

    const { events } = await searchProjectActivity(projectId);

    assert.equal(events[0].actorLabel, 'GitHub push');
  });
});

describe('getProjectActivityActors', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it("lists only people who appear in this project's log", async () => {
    const projectId = objectId();
    const member = await createUser();
    const outsider = await createUser({ firstName: 'Eve' });
    await ProjectMembership.create({ projectId, userId: member._id, role: ProjectRole.OWNER });
    await recordEvent(projectId, { actorId: member._id });
    await recordEvent(objectId(), { actorId: outsider._id });

    const actors = await getProjectActivityActors(projectId);

    assert.deepEqual(actors, [{ id: member._id.toString(), label: 'Ada Lovelace' }]);
  });
});
