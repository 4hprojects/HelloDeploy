import 'dotenv/config';
import { connectDatabase } from '@hellodeploy/database';
import { createRedisConnection, createDeploymentQueue, createDeploymentWorker } from '@hellodeploy/queue';
import { JobType } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { env } from './config/env.js';
import { setWorkerQueue } from './queue/worker-queue.js';
import { handleBuildDeployment } from './jobs/build-deployment.job.js';
import { handleActivateRelease } from './jobs/activate-release.job.js';
import { handleRollbackRelease } from './jobs/rollback-release.job.js';
import { handleVerifyDomain } from './jobs/verify-domain.job.js';
import { handleStopProject } from './jobs/stop-project.job.js';
import { handleCleanupReleases } from './jobs/cleanup-releases.job.js';

logger.info('Worker: starting HelloDeploy deployment worker', {
  nodeEnv: env.NODE_ENV,
  concurrency: env.WORKER_CONCURRENCY,
  redis: `${env.REDIS_HOST}:${env.REDIS_PORT}`,
});

// ── Database connection ────────────────────────────────────────────────────────

await connectDatabase(env.MONGODB_URI);
logger.info('Worker: database connected');

// ── Redis + BullMQ worker ──────────────────────────────────────────────────────

const redis = createRedisConnection({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
});

redis.on('error', (err) => {
  logger.error('Worker: Redis connection error', { error: err.message });
});

// Expose queue to job handlers that need to enqueue follow-on jobs
const queue = createDeploymentQueue(redis);
setWorkerQueue(queue);

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
    case JobType.CLEANUP_RELEASES:
      await handleCleanupReleases(job);
      break;
    default:
      logger.warn('Worker: unknown job type', { jobType: job.name, jobId: job.id });
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
  logger.error('Worker: worker error', { error: err.message });
});

logger.info('Worker: ready — listening for jobs');

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal) {
  logger.info(`Worker: ${signal} received — shutting down gracefully`);
  await worker.close();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
