import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { DomainStatus } = await import('@hellodeploy/contracts');
const {
  handleVerifyDomainWithDependencies,
  handleActivateDomainWithDependencies,
  handleRemoveDomainWithDependencies,
  customDomainRouteSlug,
} = await import('../../apps/worker/src/jobs/verify-domain.job.js');

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

  it('automatically queues activation after a version-2 ownership check', async () => {
    const updates = [];
    const activationJobs = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.VERIFYING,
        lifecycleVersion: 2,
        operationId: 'verify-attempt',
        verificationTokenHash: 'hash',
      },
      updates,
    );
    const ProjectModel = modelReturning({
      _id: 'project-1',
      status: 'ACTIVE',
      activeDeploymentId: 'deployment-1',
    });
    const DeploymentModel = modelReturning({
      _id: 'deployment-1',
      status: 'HEALTHY',
      containerPort: 43123,
    });

    await handleVerifyDomainWithDependencies(
      {
        data: {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          lifecycleVersion: 2,
          operationId: 'verify-attempt',
        },
      },
      {
        DomainModel,
        ProjectModel,
        DeploymentModel,
        verifyDns: async () => true,
        enqueueActivation: async (payload, jobId) => activationJobs.push({ payload, jobId }),
      },
    );

    assert.equal(updates[0].update.$set.status, DomainStatus.ACTIVATING);
    assert.equal(activationJobs.length, 1);
    assert.match(activationJobs[0].jobId, /^activate-domain-domain-1-/);
    assert.equal(activationJobs[0].payload.lifecycleVersion, 2);
  });

  it('leaves a verified domain ready for the next healthy deployment', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.VERIFYING,
        lifecycleVersion: 1,
        operationId: 'verify-attempt',
        verificationTokenHash: 'hash',
      },
      updates,
    );
    const ProjectModel = modelReturning({ _id: 'project-1', status: 'ACTIVE' });

    await handleVerifyDomainWithDependencies(
      {
        data: {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          lifecycleVersion: 1,
          operationId: 'verify-attempt',
        },
      },
      { DomainModel, ProjectModel, verifyDns: async () => true },
    );

    assert.equal(updates[0].update.$set.status, DomainStatus.VERIFIED);
  });

  it('returns a DNS mismatch to a retryable verification state', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.VERIFYING,
        lifecycleVersion: 1,
        operationId: 'verify-attempt',
        verificationTokenHash: 'hash',
      },
      updates,
    );

    await handleVerifyDomainWithDependencies(
      {
        data: {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          lifecycleVersion: 1,
          operationId: 'verify-attempt',
        },
      },
      { DomainModel, verifyDns: async () => false },
    );

    assert.equal(updates[0].update.$set.status, DomainStatus.PENDING_VERIFICATION);
    assert.match(updates[0].update.$set.operationError, /TXT record not found/i);
  });

  it('keeps an automatically verified domain retryable when activation enqueueing fails', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.VERIFYING,
        lifecycleVersion: 1,
        operationId: 'verify-attempt',
        verificationTokenHash: 'hash',
      },
      updates,
    );
    const ProjectModel = modelReturning({
      _id: 'project-1',
      status: 'ACTIVE',
      activeDeploymentId: 'deployment-1',
    });
    const DeploymentModel = modelReturning({
      _id: 'deployment-1',
      status: 'HEALTHY',
      containerPort: 43123,
    });

    await handleVerifyDomainWithDependencies(
      {
        data: {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          lifecycleVersion: 1,
          operationId: 'verify-attempt',
        },
      },
      {
        DomainModel,
        ProjectModel,
        DeploymentModel,
        verifyDns: async () => true,
        enqueueActivation: async () => {
          throw new Error('queue unavailable');
        },
      },
    );

    assert.equal(updates.at(-1).update.$set.status, DomainStatus.VERIFIED);
    assert.match(updates.at(-1).update.$set.operationError, /could not be activated/i);
  });

  it('skips a stale version-2 verification attempt', async () => {
    let checked = false;
    const DomainModel = modelReturning({
      _id: 'domain-1',
      status: DomainStatus.VERIFYING,
      lifecycleVersion: 3,
      operationId: 'new-attempt',
    });

    await handleVerifyDomainWithDependencies(
      {
        data: {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          lifecycleVersion: 2,
          operationId: 'old-attempt',
        },
      },
      { DomainModel, verifyDns: async () => (checked = true) },
    );

    assert.equal(checked, false);
  });

  it('activates and removes only the matching lifecycle operation', async () => {
    const activationUpdates = [];
    const activationModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.ACTIVATING,
        lifecycleVersion: 2,
        operationId: 'activate-attempt',
      },
      activationUpdates,
    );
    const ProjectModel = modelReturning({
      _id: 'project-1',
      status: 'ACTIVE',
      activeDeploymentId: 'deployment-1',
    });
    const DeploymentModel = modelReturning({
      _id: 'deployment-1',
      status: 'HEALTHY',
      containerPort: 43123,
    });
    const routes = [];
    const data = {
      version: 2,
      domainId: 'domain-1',
      projectId: 'project-1',
      hostname: 'app.example.com',
      lifecycleVersion: 2,
      operationId: 'activate-attempt',
    };

    await handleActivateDomainWithDependencies(
      { data, attemptsMade: 0, opts: { attempts: 3 } },
      {
        DomainModel: activationModel,
        ProjectModel,
        DeploymentModel,
        routeActivator: async (route) => routes.push(route),
        routeLock: async (_projectId, task) => task(),
        workerEnv: { NGINX_ENABLED: true },
      },
    );
    assert.equal(routes.length, 1);
    assert.equal(activationUpdates.at(-1).update.$set.status, DomainStatus.ACTIVE);

    const removalUpdates = [];
    const removalModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.REMOVING,
        lifecycleVersion: 2,
        operationId: 'remove-attempt',
      },
      removalUpdates,
    );
    const removals = [];
    await handleRemoveDomainWithDependencies(
      {
        data: { ...data, operationId: 'remove-attempt' },
        attemptsMade: 0,
        opts: { attempts: 3 },
      },
      {
        DomainModel: removalModel,
        routeRemover: async (route) => removals.push(route),
        routeLock: async (_projectId, task) => task(),
        workerEnv: { NGINX_ENABLED: true },
      },
    );
    assert.equal(removals.length, 1);
    assert.equal(removalUpdates.at(-1).update.$set.status, DomainStatus.REMOVED);
  });

  it('returns a failed final activation attempt to VERIFIED', async () => {
    const updates = [];
    const DomainModel = modelReturning(
      {
        _id: 'domain-1',
        status: DomainStatus.ACTIVATING,
        lifecycleVersion: 2,
        operationId: 'activate-attempt',
      },
      updates,
    );

    await assert.rejects(
      handleActivateDomainWithDependencies(
        {
          data: {
            version: 2,
            domainId: 'domain-1',
            projectId: 'project-1',
            hostname: 'app.example.com',
            lifecycleVersion: 2,
            operationId: 'activate-attempt',
          },
          attemptsMade: 2,
          opts: { attempts: 3 },
        },
        {
          DomainModel,
          ProjectModel: modelReturning({
            status: 'ACTIVE',
            activeDeploymentId: 'deployment-1',
          }),
          DeploymentModel: modelReturning({
            _id: 'deployment-1',
            status: 'HEALTHY',
            containerPort: 43123,
          }),
          routeActivator: async () => {
            throw new Error('nginx validation failed');
          },
          routeLock: async (_projectId, task) => task(),
          workerEnv: { NGINX_ENABLED: true },
        },
      ),
      /nginx validation failed/,
    );

    assert.equal(updates.at(-1).update.$set.status, DomainStatus.VERIFIED);
    assert.match(updates.at(-1).update.$set.operationError, /could not be activated/i);
  });

  it('skips stale activation jobs before changing nginx', async () => {
    let activated = false;
    const DomainModel = modelReturning({
      _id: 'domain-1',
      status: DomainStatus.ACTIVATING,
      lifecycleVersion: 3,
      operationId: 'new-attempt',
    });

    await handleActivateDomainWithDependencies(
      {
        data: {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          lifecycleVersion: 2,
          operationId: 'old-attempt',
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
      },
      { DomainModel, routeActivator: async () => (activated = true) },
    );

    assert.equal(activated, false);
  });
});
