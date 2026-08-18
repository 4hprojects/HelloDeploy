import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Project } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

describe('project platform-subdomain index', () => {
  before(async () => {
    await startTestDb();
    await Project.syncIndexes();
  });

  after(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('allows multiple projects with no assigned platform subdomain', async () => {
    await createProject();
    await createProject();
    await createProject();
    assert.equal(await Project.countDocuments(), 3);
  });

  it('enforces uniqueness once a string subdomain is assigned', async () => {
    await createProject({ platformSubdomain: 'assigned-app' });
    await assert.rejects(
      createProject({ platformSubdomain: 'assigned-app' }),
      (err) => err?.code === 11000,
    );
  });
});
