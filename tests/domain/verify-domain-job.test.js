import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { DomainStatus } = await import('@hellodeploy/contracts');
const { handleVerifyDomainWithDependencies, customDomainRouteSlug } =
  await import('../../apps/worker/src/jobs/verify-domain.job.js');

function modelReturning(value, updates = []) {
  return {
    findById() {
      return {
        lean: async () => value,
      };
    },
    updateOne: async (filter, update) => {
      updates.push({ filter, update });
    },
  };
}

describe('verify domain job', () => {
  it('moves verified DNS ownership checks to pending admin approval', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.PENDING_VERIFICATION,
        verificationTokenHash: 'hash',
      },
      updates,
    );

    await handleVerifyDomainWithDependencies(
      {
        data: {
          domainId: 'domain-1',
          hostname: 'app.example.com',
        },
      },
      {
        DomainModel,
        verifyDns: async () => true,
      },
    );

    assert.equal(updates.length, 1);
    assert.equal(updates[0].update.$set.status, DomainStatus.PENDING_ADMIN_APPROVAL);
    assert.ok(updates[0].update.$set.verifiedAt instanceof Date);
  });

  it('marks a custom domain active only after nginx route activation succeeds', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.PENDING_ADMIN_APPROVAL,
        approvedAt: new Date(),
      },
      updates,
    );
    const ProjectModel = modelReturning({ _id: 'project-1', activeDeploymentId: 'deployment-1' });
    const DeploymentModel = modelReturning({ _id: 'deployment-1', containerPort: 43123 });
    const activations = [];

    await handleVerifyDomainWithDependencies(
      {
        data: {
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          activateRoute: true,
        },
      },
      {
        DomainModel,
        ProjectModel,
        DeploymentModel,
        routeActivator: async (opts) => {
          activations.push(opts);
        },
        workerEnv: {
          NGINX_ENABLED: true,
          NGINX_HELLODEPLOY_CONFIG_DIR: '/tmp/hellodeploy-nginx',
          NGINX_BINARY_PATH: 'nginx',
          PLATFORM_DOMAIN: 'hellodeploy.online',
        },
      },
    );

    assert.equal(activations.length, 1);
    assert.equal(activations[0].slug, customDomainRouteSlug('app.example.com'));
    assert.match(activations[0].configContent, /server_name app\.example\.com;/);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].update.$set.status, DomainStatus.ACTIVE);
    assert.ok(updates[0].update.$set.activatedAt instanceof Date);
  });

  it('does not mark active when route activation fails', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.PENDING_ADMIN_APPROVAL,
        approvedAt: new Date(),
      },
      updates,
    );
    const ProjectModel = modelReturning({ _id: 'project-1', activeDeploymentId: 'deployment-1' });
    const DeploymentModel = modelReturning({ _id: 'deployment-1', containerPort: 43123 });

    await assert.rejects(
      handleVerifyDomainWithDependencies(
        {
          data: {
            domainId: 'domain-1',
            projectId: 'project-1',
            hostname: 'app.example.com',
            activateRoute: true,
          },
        },
        {
          DomainModel,
          ProjectModel,
          DeploymentModel,
          routeActivator: async () => {
            throw new Error('nginx validation failed');
          },
          workerEnv: {
            NGINX_ENABLED: true,
            NGINX_HELLODEPLOY_CONFIG_DIR: '/tmp/hellodeploy-nginx',
            NGINX_BINARY_PATH: 'nginx',
            PLATFORM_DOMAIN: 'hellodeploy.online',
          },
        },
      ),
      /nginx validation failed/,
    );

    assert.equal(updates.length, 0);
  });

  it('does not activate unapproved custom domains', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.PENDING_ADMIN_APPROVAL,
        approvedAt: null,
      },
      updates,
    );
    let activated = false;

    await handleVerifyDomainWithDependencies(
      {
        data: {
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          activateRoute: true,
        },
      },
      {
        DomainModel,
        routeActivator: async () => {
          activated = true;
        },
        workerEnv: {
          NGINX_ENABLED: true,
          NGINX_HELLODEPLOY_CONFIG_DIR: '/tmp/hellodeploy-nginx',
          NGINX_BINARY_PATH: 'nginx',
          PLATFORM_DOMAIN: 'hellodeploy.online',
        },
      },
    );

    assert.equal(activated, false);
    assert.equal(updates.length, 0);
  });
});
