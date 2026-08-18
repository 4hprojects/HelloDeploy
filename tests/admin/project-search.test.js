import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';
import { ProjectStatus } from '@hellodeploy/contracts';

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

  it('uses only allowlisted primitive status filters', async () => {
    await createProject({ name: 'Active app', status: ProjectStatus.ACTIVE });
    await createProject({ name: 'Draft app', status: ProjectStatus.DRAFT });

    const filtered = await getProjects({ status: ProjectStatus.ACTIVE });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.projects[0].name, 'Active app');

    const injected = await getProjects({ status: { $ne: ProjectStatus.ARCHIVED } });
    assert.equal(injected.total, 2);
  });

  it('rejects non-string search objects as query input', async () => {
    await createProject({ name: 'Safe app' });

    const { total } = await getProjects({ search: { $ne: '' } });

    assert.equal(total, 1);
  });
});
