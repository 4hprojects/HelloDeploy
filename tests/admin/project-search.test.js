import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { getProjects } = await import('../../apps/web/src/services/admin.service.js');

describe('admin.service — getProjects search', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('matches a project by name', async () => {
    await createProject({ name: 'Marketing Site', slug: 'marketing-site' });
    await createProject({ name: 'Internal Tool', slug: 'internal-tool' });

    const { projects, total } = await getProjects({ search: 'marketing' });

    assert.equal(total, 1);
    assert.equal(projects[0].name, 'Marketing Site');
  });

  it('matches a project by slug', async () => {
    await createProject({ name: 'Marketing Site', slug: 'marketing-site' });
    await createProject({ name: 'Internal Tool', slug: 'internal-tool' });

    const { projects, total } = await getProjects({ search: 'internal-tool' });

    assert.equal(total, 1);
    assert.equal(projects[0].slug, 'internal-tool');
  });

  it('returns every project when no search term is given', async () => {
    await createProject();
    await createProject();

    const { total } = await getProjects({});

    assert.equal(total, 2);
  });
});
