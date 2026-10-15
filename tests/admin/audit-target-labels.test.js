import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { AuditEvent, User } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';

import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { searchAuditEvents, toActionLabel, getAuditFilterOptions } =
  await import('../../apps/web/src/services/audit-search.service.js');

async function targetOf(targetType, targetId) {
  await AuditEvent.create({
    action: 'test.event',
    outcome: AuditOutcome.SUCCESS,
    targetType,
    targetId: String(targetId),
  });
  const { events } = await searchAuditEvents({});
  return events[0].target;
}

before(async () => {
  await startTestDb();
});
after(async () => {
  await stopTestDb();
});
beforeEach(async () => {
  await clearTestDb();
});

describe('audit event target labels', () => {
  it('names a user target and links to its admin page', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      passwordHash: 'hash',
    });
    assert.deepEqual(await targetOf('user', user._id), {
      label: 'Ada Lovelace',
      href: `/admin/users/${user._id}`,
    });
  });

  it('names a deployment by its project and sequence number', async () => {
    const project = await createProject({ name: 'Hello Run', slug: 'hello-run' });
    const deployment = await createDeployment(project._id, { sequenceNumber: 7 });
    assert.deepEqual(await targetOf('deployment', deployment._id), {
      label: 'Hello Run #7',
      href: '/admin/projects?search=hello-run',
    });
  });

  it('falls back to type and short id when the record is gone', async () => {
    const missingId = objectId().toString();
    assert.deepEqual(await targetOf('nginx_route_batch', missingId), {
      label: 'Routing batch',
      shortId: missingId.slice(-8),
      href: null,
    });
  });
});

describe('audit labels', () => {
  it('reads an action without its category', () => {
    assert.equal(toActionLabel('auth.sign_in'), 'Sign in');
  });

  it('offers one action category per recorded prefix', async () => {
    await AuditEvent.create([
      { action: 'auth.sign_in', outcome: AuditOutcome.SUCCESS },
      { action: 'auth.sign_out', outcome: AuditOutcome.SUCCESS },
      { action: 'deployment.healthy', outcome: AuditOutcome.SUCCESS },
    ]);
    const { actionCategories } = await getAuditFilterOptions();
    assert.deepEqual(actionCategories, [
      { value: 'auth.', label: 'Sign-in & accounts' },
      { value: 'deployment.', label: 'Deployments' },
    ]);
  });
});
