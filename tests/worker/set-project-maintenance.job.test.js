import assert from 'node:assert/strict';
import { before, after, beforeEach, describe, it } from 'node:test';

process.env.NGINX_ENABLED = 'true';

import { Project } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createDeployment, createProject } from '../helpers/worker-fixtures.js';

const { handleSetProjectMaintenance } =
  await import('../../apps/worker/src/jobs/set-project-maintenance.job.js');

describe('set-project-maintenance job', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('enables maintenance for managed and active custom hostnames together', async () => {
    const project = await createProject({ platformSubdomain: 'my-app' });
    const activations = [];
    await handleSetProjectMaintenance(
      { data: { projectId: project._id.toString(), enabled: true, message: 'Updating' } },
      {
        listActiveCustomDomains: async () => [{ hostnameNormalized: 'app.example.com' }],
        activateRoutes: async ({ routes }) => activations.push(...routes),
      },
    );
    assert.equal(activations.length, 2);
    for (const route of activations) {
      assert.match(route.configContent, /return 503 "Updating"/);
    }
  });

  it('restores managed and active custom hostnames to the active deployment', async () => {
    const project = await createProject({ platformSubdomain: 'my-app' });
    const deployment = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'container-live',
      containerPort: 43123,
    });
    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: deployment._id } });
    const activations = [];
    await handleSetProjectMaintenance(
      { data: { projectId: project._id.toString(), enabled: false } },
      {
        listActiveCustomDomains: async () => [{ hostnameNormalized: 'app.example.com' }],
        activateRoutes: async ({ routes }) => activations.push(...routes),
      },
    );
    assert.equal(activations.length, 2);
    for (const route of activations) {
      assert.match(route.configContent, /127\.0\.0\.1:43123/);
    }
  });
});
