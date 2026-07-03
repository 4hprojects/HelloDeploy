import { Project, Deployment, Repository } from '@hellodeploy/database';
import {
  DeploymentStatus,
  DeploymentTrigger,
  ProjectStatus,
  RuntimeType,
} from '@hellodeploy/contracts';
import { objectId } from './worker-db.js';

let slugCounter = 0;

export async function createProject(overrides = {}) {
  return Project.create({
    name: 'Test Project',
    slug: `test-project-${++slugCounter}`,
    ownerId: objectId(),
    status: ProjectStatus.ACTIVE,
    runtimeType: RuntimeType.NODEJS,
    ...overrides,
  });
}

export async function createDeployment(projectId, overrides = {}) {
  return Deployment.create({
    projectId,
    sequenceNumber: 1,
    triggerType: DeploymentTrigger.MANUAL,
    requestedBy: objectId(),
    commitSha: 'a'.repeat(40),
    configurationVersion: 1,
    status: DeploymentStatus.QUEUED,
    ...overrides,
  });
}

export async function createRepository(projectId, overrides = {}) {
  return Repository.create({
    projectId,
    installationId: 12345,
    githubRepoId: 67890,
    nodeId: 'R_test',
    fullName: 'owner/repo',
    name: 'repo',
    ownerLogin: 'owner',
    accessStatus: 'ACTIVE',
    ...overrides,
  });
}
