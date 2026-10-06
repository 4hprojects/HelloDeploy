#!/usr/bin/env node

// Browser QA fixture server. This uses the real Express/EJS application and
// database models with deterministic, synthetic records. It is not supported-
// host, Docker, or production evidence.
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '4173';
process.env.HOST = '127.0.0.1';
process.env.PLATFORM_DOMAIN = `127.0.0.1:${process.env.PORT}`;
process.env.PLATFORM_SUBDOMAIN_SUFFIX = '.example.test';
process.env.DEPLOYMENT_DOMAIN = 'example.test';
process.env.SESSION_SECRET = 'browser-fixture-session-secret';
// The deterministic fixture cannot solve an external Turnstile challenge. Set
// both values explicitly so dotenv cannot inherit configured developer keys.
process.env.TURNSTILE_SITE_KEY = '';
process.env.TURNSTILE_SECRET_KEY = '';

const { mkdir, rm } = await import('node:fs/promises');
const { join } = await import('node:path');
const { tmpdir } = await import('node:os');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const fixtureDatabasePath = join(tmpdir(), 'hellodeploy-browser-fixture-db');
await rm(fixtureDatabasePath, { recursive: true, force: true });
await mkdir(fixtureDatabasePath, { recursive: true });
const mongod = await MongoMemoryServer.create({ instance: { dbPath: fixtureDatabasePath } });
process.env.MONGODB_URI = mongod.getUri('hellodeploy-browser-fixture');

const {
  connectDatabase,
  disconnectDatabase,
  User,
  Project,
  ProjectMembership,
  Repository,
  Deployment,
} = await import('@hellodeploy/database');
const {
  PlatformRole,
  UserStatus,
  ProjectRole,
  ProjectStatus,
  RuntimeType,
  DetectionStatus,
  RepositorySourceType,
  DeploymentStatus,
  DeploymentTrigger,
} = await import('@hellodeploy/contracts');
const { hashPassword } = await import('@hellodeploy/auth');

await connectDatabase(process.env.MONGODB_URI);
const passwordHash = await hashPassword('FixturePass123!');
const [user] = await User.create([
  {
    firstName: 'Demo',
    lastName: 'Owner',
    email: 'demo@hellodeploy.test',
    passwordHash,
    platformRole: PlatformRole.USER,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    firstName: 'Admin',
    lastName: 'Operator',
    email: 'admin@hellodeploy.test',
    passwordHash,
    platformRole: PlatformRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  },
]);

const project = await Project.create({
  name: 'Northstar Notes',
  slug: 'northstar-notes',
  ownerId: user._id,
  status: ProjectStatus.ACTIVE,
  runtimeType: RuntimeType.NODEJS,
  productionBranch: 'main',
  platformSubdomain: 'northstar-notes',
  buildConfiguration: {
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    applicationPort: 3000,
    healthCheckPath: '/health',
  },
  detection: {
    status: DetectionStatus.READY,
    issues: [],
    checkedCommitSha: '1111111111111111111111111111111111111111',
    checkedAt: new Date('2026-01-02T00:00:00Z'),
    detectedConfiguration: {
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      applicationPort: 3000,
      healthCheckPath: '/health',
    },
    requiredEnvironmentVariables: ['DATABASE_URL', 'SESSION_SECRET'],
  },
});
await ProjectMembership.create({
  projectId: project._id,
  userId: user._id,
  role: ProjectRole.OWNER,
  acceptedAt: new Date('2026-01-01T00:00:00Z'),
});
const repository = await Repository.create({
  projectId: project._id,
  sourceType: RepositorySourceType.PUBLIC_GIT,
  canonicalCloneUrl: 'https://github.com/example/northstar-notes.git',
  fullName: 'example/northstar-notes',
  name: 'northstar-notes',
  ownerLogin: 'example',
  defaultBranch: 'main',
  visibility: 'public',
  lastCommitSha: '1111111111111111111111111111111111111111',
  lastCommitMessage: 'Improve the notes dashboard',
  lastCommitAt: new Date('2026-01-02T00:00:00Z'),
  lastAccessCheckedAt: new Date('2026-01-02T00:00:00Z'),
});
project.repositoryId = repository._id;
const rollbackTarget = await Deployment.create({
  projectId: project._id,
  sequenceNumber: 4,
  triggerType: DeploymentTrigger.MANUAL,
  requestedBy: user._id,
  commitSha: '4444444444444444444444444444444444444444',
  commitMessage: 'Stable retained release',
  branch: 'main',
  configurationVersion: 1,
  status: DeploymentStatus.HEALTHY,
  completedAt: new Date('2026-01-01T22:01:00Z'),
});
await Deployment.create({
  projectId: project._id,
  sequenceNumber: 5,
  triggerType: DeploymentTrigger.ROLLBACK,
  requestedBy: user._id,
  commitSha: rollbackTarget.commitSha,
  commitMessage: 'Restore retained release',
  branch: 'main',
  configurationVersion: 1,
  status: DeploymentStatus.HEALTHY,
  sourceDeploymentId: rollbackTarget._id,
  startedAt: new Date('2026-01-01T23:00:00Z'),
  completedAt: new Date('2026-01-01T23:00:30Z'),
});
await Deployment.create({
  projectId: project._id,
  sequenceNumber: 6,
  triggerType: DeploymentTrigger.MANUAL,
  requestedBy: user._id,
  commitSha: '6666666666666666666666666666666666666666',
  commitMessage: 'Attempt an incompatible start command',
  branch: 'recovery-demo',
  configurationVersion: 1,
  status: DeploymentStatus.FAILED,
  failureCode: 'HEALTH_CHECK_FAILED',
  failureSummary: 'The candidate did not answer its configured health check.',
  startedAt: new Date('2026-01-01T23:30:00Z'),
  completedAt: new Date('2026-01-01T23:31:00Z'),
});
const deployment = await Deployment.create({
  projectId: project._id,
  sequenceNumber: 7,
  triggerType: DeploymentTrigger.MANUAL,
  requestedBy: user._id,
  commitSha: '1111111111111111111111111111111111111111',
  commitMessage: 'Improve the notes dashboard',
  branch: 'main',
  configurationVersion: 1,
  status: DeploymentStatus.HEALTHY,
  currentStage: 'COMPLETE',
  startedAt: new Date('2026-01-02T00:00:00Z'),
  completedAt: new Date('2026-01-02T00:01:12Z'),
});
project.activeDeploymentId = deployment._id;
await project.save();

const { createApp } = await import('../apps/web/src/app.js');
const app = createApp({
  readinessCheck: async () => ({
    ready: true,
    checks: { database: 'ok', queue: 'ok', worker: 'ok' },
  }),
});
const server = app.listen(Number(process.env.PORT), process.env.HOST, () => {
  process.stdout.write(
    `Browser fixture listening on http://${process.env.HOST}:${process.env.PORT}\n`,
  );
});

async function shutdown() {
  server.close(async () => {
    await app.locals.drainSessionWrites?.();
    await disconnectDatabase();
    await mongod.stop();
    await rm(fixtureDatabasePath, { recursive: true, force: true });
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
