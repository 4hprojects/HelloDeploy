import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import {
  Deployment,
  Project,
  ProjectMembership,
  Repository,
  mongoose,
} from '@hellodeploy/database';
import {
  DeploymentStatus,
  DeploymentTrigger,
  ProjectRole,
  ProjectStatus,
} from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { rollbackDeployment } = await import('../../apps/web/src/services/deployment.service.js');
const { transferOwnership } = await import('../../apps/web/src/services/project.service.js');

const OPERATOR = { $ne: null };

describe('mongoose does not block operator injection', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
    // Inserted directly: this is about query casting, not document validation.
    await Repository.collection.insertOne({
      projectId: objectId(),
      sourceType: 'GITHUB_APP',
      provider: 'GITHUB',
      installationId: 12345,
      fullName: 'owner/repo',
      accessStatus: 'ACTIVE',
    });
  });

  it('matches a record through an operator on a string field', async () => {
    const found = await Repository.findOne({ fullName: OPERATOR }).lean();

    assert.notEqual(found, null);
  });

  it('matches a record through an operator on a number field', async () => {
    const found = await Repository.findOne({ installationId: OPERATOR }).lean();

    assert.notEqual(found, null);
  });
});

describe('request-supplied ids are rejected before reaching a query', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses an operator object as a rollback target', async () => {
    const project = await Project.create({
      name: 'My App',
      slug: 'myapp-rollback',
      ownerId: objectId(),
      status: ProjectStatus.ACTIVE,
    });
    // A rollback candidate has to exist, or an unguarded lookup finds nothing
    // and reports the same "not found" the guard does — proving nothing.
    await Deployment.create({
      projectId: project._id,
      sequenceNumber: 1,
      triggerType: DeploymentTrigger.MANUAL,
      requestedBy: objectId(),
      commitSha: 'a'.repeat(40),
      configurationVersion: 1,
      status: DeploymentStatus.HEALTHY,
      imageTag: 'myapp-aaaaaaa-1',
    });

    const result = await rollbackDeployment(project._id, OPERATOR, objectId());

    assert.equal(result.error, 'Target deployment not found.');
  });

  it('refuses an operator object as a new owner', async () => {
    const actorId = objectId();
    const project = await Project.create({
      name: 'My App',
      slug: 'myapp-transfer',
      ownerId: actorId,
      status: ProjectStatus.ACTIVE,
    });
    await ProjectMembership.create({
      projectId: project._id,
      userId: actorId,
      role: ProjectRole.OWNER,
    });

    // The actor really is the owner, so without the guard the operator reaches
    // the membership query and the call gets past the ownership check.
    const result = await transferOwnership({
      projectId: project._id,
      newOwnerId: OPERATOR,
      actorId,
    });

    assert.equal(result.error, 'Choose a member to transfer ownership to.');
  });

  it('lets a well-formed id past the guard', async () => {
    const result = await transferOwnership({
      projectId: objectId(),
      newOwnerId: objectId(),
      actorId: objectId(),
    });

    // Past the guard, it stops at the ownership check instead.
    assert.match(result.error, /owner can transfer ownership/);
  });

  it('rejects a valid id string only when it is not an id', () => {
    assert.equal(mongoose.isValidObjectId('not-an-id'), false);
  });
});
