import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '@hellodeploy/database';
import {
  createRedisConnection,
  createDeploymentQueue,
  createDeploymentWorker,
  classifyRedisError,
} from '@hellodeploy/queue';
import { JobType, validateJobPayload } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { env } from './config/env.js';
import { setWorkerQueue } from './queue/worker-queue.js';
import { setWorkerRedis } from './queue/worker-redis.js';
import { validateNginxConfig } from './nginx/helper-client.js';
import { handleBuildDeployment } from './jobs/build-deployment.job.js';
import { handleActivateRelease } from './jobs/activate-release.job.js';
import { handleRollbackRelease } from './jobs/rollback-release.job.js';
import { handleVerifyDomain } from './jobs/verify-domain.job.js';
import { handleStopProject } from './jobs/stop-project.job.js';
import { handleDeleteProject } from './jobs/delete-project.job.js';
import { handleSetProjectMaintenance } from './jobs/set-project-maintenance.job.js';
import { handleCleanupReleases } from './jobs/cleanup-releases.job.js';
import { createGracefulWorkerShutdown } from './lifecycle.js';

logger.info('Worker: starting HelloDeploy deployment worker', {
  nodeEnv: env.NODE_ENV,
  concurrency: env.WORKER_CONCURRENCY,
  redisMode: env.REDIS_MODE,
});

if (env.NGINX_ENABLED) {
  await validateNginxConfig();
  logger.info('Worker: Nginx helper connected and configuration valid');
}

// ── Database connection ────────────────────────────────────────────────────────

await connectDatabase(env.MONGODB_URI);
logger.info('Worker: database connected');

// ── Redis + BullMQ worker ──────────────────────────────────────────────────────

const redis = createRedisConnection(env.REDIS_CONNECTION);

redis.on('error', (err) => {
  logger.error('Worker: Redis connection error', { error: classifyRedisError(err) });
});

// Expose queue to job handlers that need to enqueue follow-on jobs
const queue = createDeploymentQueue(redis);
setWorkerQueue(queue);
// Expose the connection for fire-and-forget publishes (live deploy logs)
setWorkerRedis(redis);

/**
 * Main job processor — dispatches to the correct handler by job name.
 *
 * @param {import('bullmq').Job} job
 */
async function processJob(job) {
  logger.info('Worker: processing job', {
    jobId: job.id,
    jobType: job.name,
    attemptsMade: job.attemptsMade,
  });

  validateJobPayload(job.name, job.data);

  switch (job.name) {
    case JobType.BUILD_DEPLOYMENT:
      await handleBuildDeployment(job);
      break;
    case JobType.ACTIVATE_RELEASE:
      await handleActivateRelease(job);
      break;
    case JobType.ROLLBACK_RELEASE:
      await handleRollbackRelease(job);
      break;
    case JobType.VERIFY_DOMAIN:
      await handleVerifyDomain(job);
      break;
    case JobType.STOP_PROJECT:
      await handleStopProject(job);
      break;
    case JobType.DELETE_PROJECT:
      await handleDeleteProject(job);
      break;
    case JobType.SET_PROJECT_MAINTENANCE:
      await handleSetProjectMaintenance(job);
      break;
    case JobType.CLEANUP_RELEASES:
      await handleCleanupReleases(job);
      break;
    default:
      // Throwing marks the job failed in BullMQ; completing it silently would
      // hide a contract mismatch between the web enqueuer and this worker.
      throw new Error(`Unknown job type: ${job.name}`);
  }
}

const worker = createDeploymentWorker(redis, processJob, env.WORKER_CONCURRENCY);

worker.on('completed', (job) => {
  logger.info('Worker: job completed', { jobId: job.id, jobType: job.name });
});

worker.on('failed', (job, err) => {
  logger.error('Worker: job failed', {
    jobId: job?.id,
    jobType: job?.name,
    error: err.message,
    attemptsMade: job?.attemptsMade,
  });
});

worker.on('error', (err) => {
  logger.error('Worker: worker error', { error: classifyRedisError(err) });
});

logger.info('Worker: ready — listening for jobs');

// ── Graceful shutdown ──────────────────────────────────────────────────────────

const shutdown = createGracefulWorkerShutdown({
  worker,
  closeRedis: () => redis.quit(),
  closeDatabase: disconnectDatabase,
  logger,
});

async function handleSignal(signal) {
  const result = await shutdown(signal);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

process.once('SIGTERM', () => void handleSignal('SIGTERM'));
process.once('SIGINT', () => void handleSignal('SIGINT'));
