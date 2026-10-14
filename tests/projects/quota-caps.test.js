import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Domain, Quota, User } from '@hellodeploy/database';
import {
  AccountTier,
  ApiError,
  DeploymentStatus,
  DeploymentTrigger,
  DomainStatus,
  DomainType,
  QuotaScope,
} from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { checkDeploymentQuota, checkDomainQuota, startOfUtcMonth } =
  await import('../../apps/web/src/services/quota.service.js');
const { addDomain } = await import('../../apps/web/src/services/domain.service.js');

async function seedDeployments(projectId, count, overrides = {}) {
  for (let seq = 1; seq <= count; seq++) {
    await createDeployment(projectId, {
      sequenceNumber: seq,
      status: DeploymentStatus.FAILED,
      ...overrides,
    });
  }
}

async function setProjectQuota(projectId, limits) {
  await Quota.create({ scopeType: QuotaScope.PROJECT, scopeId: projectId, ...limits });
}

describe('quota caps — deployments per month', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('allows a deployment one below the monthly allowance', async () => {
    const project = await createProject();
    await setProjectQuota(project._id, { deploymentsPerMonth: 3 });
    await seedDeployments(project._id, 2);
    assert.equal(await checkDeploymentQuota(project), null);
  });

  it('refuses a deployment once the monthly allowance is used', async () => {
    const project = await createProject();
    await setProjectQuota(project._id, { deploymentsPerMonth: 3 });
    await seedDeployments(project._id, 3);
    const refusal = await checkDeploymentQuota(project);
    assert.equal(refusal?.code, ApiError.QUOTA_EXCEEDED);
  });

  it('offers Premium when the monthly allowance is used', async () => {
    const project = await createProject();
    await setProjectQuota(project._id, { deploymentsPerMonth: 3 });
    await seedDeployments(project._id, 3);
    const refusal = await checkDeploymentQuota(project);
    assert.equal(refusal?.offerPremium, true);
  });

  it('lets a Premium owner deploy past the monthly allowance', async () => {
    const owner = await User.create({
      email: 'premium-owner@example.com',
      firstName: 'Pre',
      lastName: 'Mium',
      passwordHash: 'not-a-real-hash',
      accountTier: AccountTier.PREMIUM,
    });
    const project = await createProject({ ownerId: owner._id });
    await setProjectQuota(project._id, { deploymentsPerMonth: 3 });
    await seedDeployments(project._id, 3);
    assert.equal(await checkDeploymentQuota(project), null);
  });

  it('does not count deployments from a previous month', async () => {
    const project = await createProject();
    await setProjectQuota(project._id, { deploymentsPerMonth: 1 });
    await seedDeployments(project._id, 2);
    const lastMonth = new Date(startOfUtcMonth().getTime() - 1);
    await Deployment.collection.updateMany({}, { $set: { createdAt: lastMonth } });
    assert.equal(await checkDeploymentQuota(project), null);
  });

  it('does not count rollbacks against the allowance', async () => {
    const project = await createProject();
    await setProjectQuota(project._id, { deploymentsPerMonth: 1 });
    await seedDeployments(project._id, 2, { triggerType: DeploymentTrigger.ROLLBACK });
    assert.equal(await checkDeploymentQuota(project), null);
  });
});

describe('quota caps — running apps', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses a first release when the owner is at the running-app limit', async () => {
    const ownerId = objectId();
    const running = await createProject({ ownerId });
    await createDeployment(running._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'c-1',
    });
    const idle = await createProject({ ownerId });
    const refusal = await checkDeploymentQuota(idle);
    assert.match(refusal?.error ?? '', /1 of 1 running apps/);
  });

  it('lets an already-running project redeploy at the running-app limit', async () => {
    const project = await createProject();
    await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'c-1',
    });
    assert.equal(await checkDeploymentQuota(project), null);
  });
});

describe('quota caps — custom domains', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function claimDomain(projectId, hostname, status = DomainStatus.ACTIVE) {
    await Domain.create({
      projectId,
      hostnameNormalized: hostname,
      type: DomainType.CUSTOM,
      status,
      verificationTokenHash: 'hash',
      addedBy: objectId(),
    });
  }

  it('ignores removed domains when counting', async () => {
    const project = await createProject();
    await claimDomain(project._id, 'old.example.com', DomainStatus.REMOVED);
    assert.equal(await checkDomainQuota(project), null);
  });

  it('refuses a new domain once the project is at its limit', async () => {
    const project = await createProject();
    await claimDomain(project._id, 'one.example.com');
    const result = await addDomain(project._id, 'two.example.com', objectId());
    assert.equal(result.code, ApiError.QUOTA_EXCEEDED);
  });

  it('reports the project limit when refusing a domain', async () => {
    const project = await createProject();
    await claimDomain(project._id, 'one.example.com');
    assert.equal((await checkDomainQuota(project))?.limit, 1);
  });
});
