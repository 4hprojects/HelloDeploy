import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.GITHUB_WEBHOOK_SECRET = 'push-test-secret';
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'hellodeploy-test';

const { handlePushEvent } = await import('../../apps/web/src/controllers/webhook.controller.js');
const { DeploymentMode, DeploymentStatus, ProjectStatus, DeploymentTrigger } =
  await import('@hellodeploy/contracts');

function makePayload(overrides = {}) {
  return {
    installation: { id: 123 },
    repository: { full_name: 'owner/app' },
    ref: 'refs/heads/main',
    after: 'abcdef1234567890abcdef1234567890abcdef12',
    head_commit: { message: 'Deploy this commit\n\nBody' },
    commits: [{ added: ['src/app.js'], modified: [], removed: [] }],
    ...overrides,
  };
}

function makeRepoRecord() {
  return {
    _id: 'repo-1',
    projectId: 'project-1',
    lastCommitSha: null,
    lastCommitMessage: null,
    lastCommitAt: null,
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    },
  };
}

function makeProject(overrides = {}) {
  return {
    _id: 'project-1',
    ownerId: 'owner-1',
    status: ProjectStatus.ACTIVE,
    productionBranch: 'main',
    deploymentMode: DeploymentMode.AUTOMATIC,
    ...overrides,
  };
}

function makeDeps({ repo = makeRepoRecord(), project = makeProject(), deploymentResult } = {}) {
  const createDeploymentCalls = [];
  const projectUpdateCalls = [];
  const sendProjectPausedEmailCalls = [];

  return {
    repo,
    project,
    createDeploymentCalls,
    projectUpdateCalls,
    sendProjectPausedEmailCalls,
    Repository: {
      async findOne(query) {
        assert.deepEqual(query, {
          installationId: 123,
          fullName: 'owner/app',
          accessStatus: 'ACTIVE',
        });
        return repo;
      },
    },
    Project: {
      async findById(projectId) {
        assert.equal(projectId, repo.projectId);
        return project;
      },
      async updateOne(query, update) {
        projectUpdateCalls.push({ query, update });
      },
    },
    User: {
      async findById(userId) {
        assert.equal(userId, project.ownerId);
        return { firstName: 'Ada', email: 'ada@example.com' };
      },
    },
    async createDeployment(opts) {
      createDeploymentCalls.push(opts);
      return (
        deploymentResult ?? {
          success: true,
          deployment: { _id: 'deployment-1', status: DeploymentStatus.QUEUED },
        }
      );
    },
    async sendProjectPausedEmail(opts) {
      sendProjectPausedEmailCalls.push(opts);
    },
  };
}

describe('GitHub push webhook deployment behavior', () => {
  it('queues an automatic deployment for a production-branch push in automatic mode', async () => {
    const deps = makeDeps();
    await handlePushEvent(makePayload(), 'correlation-1', deps);

    assert.equal(deps.repo.saveCalls, 1);
    assert.equal(deps.repo.lastCommitSha, 'abcdef1234567890abcdef1234567890abcdef12');
    assert.equal(deps.repo.lastCommitMessage, 'Deploy this commit');
    assert.ok(deps.repo.lastCommitAt instanceof Date);
    assert.equal(deps.createDeploymentCalls.length, 1);
    assert.deepEqual(deps.createDeploymentCalls[0], {
      projectId: 'project-1',
      actorId: 'owner-1',
      triggerType: DeploymentTrigger.AUTOMATIC,
      correlationId: 'correlation-1',
    });
  });

  it('updates commit metadata but does not deploy in manual mode', async () => {
    const deps = makeDeps({ project: makeProject({ deploymentMode: DeploymentMode.MANUAL }) });
    await handlePushEvent(makePayload(), 'correlation-2', deps);

    assert.equal(deps.repo.saveCalls, 1);
    assert.equal(deps.repo.lastCommitSha, 'abcdef1234567890abcdef1234567890abcdef12');
    assert.equal(deps.createDeploymentCalls.length, 0);
  });

  it('updates commit metadata but does not deploy for non-production branch pushes', async () => {
    const deps = makeDeps();
    await handlePushEvent(makePayload({ ref: 'refs/heads/feature-branch' }), 'correlation-3', deps);

    assert.equal(deps.repo.saveCalls, 1);
    assert.equal(deps.repo.lastCommitSha, 'abcdef1234567890abcdef1234567890abcdef12');
    assert.equal(deps.createDeploymentCalls.length, 0);
  });

  it('does not deploy when high-risk files changed', async () => {
    const deps = makeDeps();
    await handlePushEvent(
      makePayload({
        commits: [{ added: ['Dockerfile'], modified: ['src/app.js'], removed: [] }],
      }),
      'correlation-4',
      deps,
    );

    assert.equal(deps.repo.saveCalls, 1);
    assert.equal(deps.createDeploymentCalls.length, 0);
  });

  it('flags the project for review when high-risk files changed', async () => {
    const deps = makeDeps();
    await handlePushEvent(
      makePayload({
        commits: [{ added: ['Dockerfile'], modified: ['src/app.js'], removed: [] }],
      }),
      'correlation-5',
      deps,
    );

    assert.equal(deps.projectUpdateCalls[0].update.$set.reviewFlag.reason, 'HIGH_RISK_FILE_CHANGE');
  });

  it('emails the project owner when high-risk files changed', async () => {
    const deps = makeDeps();
    await handlePushEvent(
      makePayload({
        commits: [{ added: ['Dockerfile'], modified: ['src/app.js'], removed: [] }],
      }),
      'correlation-6',
      deps,
    );

    assert.equal(deps.sendProjectPausedEmailCalls[0].to, 'ada@example.com');
  });
});
