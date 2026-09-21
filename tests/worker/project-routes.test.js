import assert from 'node:assert/strict';
import { before, after, beforeEach, describe, it } from 'node:test';

import { Domain, mongoose } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';
import {
  buildApplicationRouteSet,
  customDomainRouteSlug,
  listActiveCustomDomains,
} from '../../apps/worker/src/nginx/project-routes.js';

describe('project route sets', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('loads only active custom domains in deterministic hostname order', async () => {
    const project = await createProject();
    const addedBy = new mongoose.Types.ObjectId();
    await Domain.create([
      {
        projectId: project._id,
        hostnameNormalized: 'z.example.com',
        status: DomainStatus.ACTIVE,
        addedBy,
      },
      {
        projectId: project._id,
        hostnameNormalized: 'a.example.com',
        status: DomainStatus.ACTIVE,
        addedBy,
      },
      {
        projectId: project._id,
        hostnameNormalized: 'pending.example.com',
        status: DomainStatus.PENDING_VERIFICATION,
        addedBy,
      },
      {
        projectId: project._id,
        hostnameNormalized: 'failed.example.com',
        status: DomainStatus.FAILED,
        addedBy,
      },
      {
        projectId: project._id,
        hostnameNormalized: 'removed.example.com',
        status: DomainStatus.REMOVED,
        addedBy,
      },
    ]);

    const domains = await listActiveCustomDomains(project._id);
    assert.deepEqual(
      domains.map((domain) => domain.hostnameNormalized),
      ['a.example.com', 'z.example.com'],
    );
  });

  it('builds one managed route plus one route per custom hostname', async () => {
    const project = await createProject({ platformSubdomain: 'my-app' });
    const routes = buildApplicationRouteSet({
      project,
      port: 43123,
      deploymentId: 'deployment-id',
      customDomains: [{ hostnameNormalized: 'app.example.com' }],
    });
    assert.deepEqual(
      routes.map((route) => route.slug),
      ['my-app', customDomainRouteSlug('app.example.com')],
    );
    assert.match(routes[1].configContent, /server_name app\.example\.com/);
  });

  it('rejects unsafe custom hostnames before generating route content', async () => {
    const project = await createProject({ platformSubdomain: 'my-app' });
    assert.throws(
      () =>
        buildApplicationRouteSet({
          project,
          port: 43123,
          deploymentId: 'deployment-id',
          customDomains: [{ hostnameNormalized: 'bad; include /etc/passwd' }],
        }),
      /cannot be routed/,
    );
  });
});
