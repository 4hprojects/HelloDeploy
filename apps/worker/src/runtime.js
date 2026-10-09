import 'dotenv/config';
import { connectDatabase, disconnectDatabase, AuditEvent } from '@hellodeploy/database';
import {
  createRedisConnection,
  createDeploymentQueue,
  createDeploymentWorker,
  createNotificationQueue,
  createNotificationWorker,
  classifyRedisError,
} from '@hellodeploy/queue';
import { JobType, validateJobPayload } from '@hellodeploy/contracts';
import { logger, configureAuditService } from '@hellodeploy/observability';
import { env } from './config/env.js';
import { setWorkerQueue } from './queue/worker-queue.js';
import { setWorkerRedis } from './queue/worker-redis.js';
import { validateNginxConfig } from './nginx/helper-client.js';
import { ensureBuildBuilder } from './deployment/build.js';
import { handleBuildDeployment } from './jobs/build-deployment.job.js';
import { handleActivateRelease } from './jobs/activate-release.job.js';
import { handleRollbackRelease } from './jobs/rollback-release.job.js';
import { handleVerifyDomain } from './jobs/verify-domain.job.js';
import { handleActivateDomain } from './jobs/activate-domain.job.js';
import { handleRemoveDomain } from './jobs/remove-domain.job.js';
import { handleStopProject } from './jobs/stop-project.job.js';
import { handleDeleteProject } from './jobs/delete-project.job.js';
import { handleSetProjectMaintenance } from './jobs/set-project-maintenance.job.js';
import { handleCleanupReleases } from './jobs/cleanup-releases.job.js';
import { createGracefulWorkerShutdown } from './lifecycle.js';
import { handleSendNotification, sweepNotifications } from './jobs/send-notification.job.js';
import { setNotificationQueue } from './queue/notification-queue.js';

logger.info('Worker: starting HelloDeploy deployment worker', {
  nodeEnv: env.NODE_ENV,
  concurrency: env.WORKER_CONCURRENCY,
  redisMode: env.REDIS_MODE,
});

if (env.NGINX_ENABLED) {
  await validateNginxConfig();
  logger.info('Worker: Nginx helper connected and configuration valid');
}

if (env.BUILD_BUILDER_NAME) {
  // A builder failure must not stop the worker: activations and rollbacks still
  // need it, and each build then fails with Docker's own explanation.
  try {
    const { created } = await ensureBuildBuilder({
      name: env.BUILD_BUILDER_NAME,
      memoryMb: env.BUILD_MEMORY_MB,
    });
    logger.info('Worker: memory-limited build builder ready', {
      builder: env.BUILD_BUILDER_NAME,
      memoryMb: env.BUILD_MEMORY_MB,
      created,
    });
  } catch (err) {
    logger.error('Worker: build builder unavailable; builds will fail until it is fixed', {
      builder: env.BUILD_BUILDER_NAME,
      error: err.message,
    });
  }
} else {
  logger.warn(
    'Worker: BUILD_BUILDER_NAME is unset; BuildKit ignores the per-build memory limit, so BUILD_MEMORY_MB is not enforced',
  );
}

// ── Database connection ────────────────────────────────────────────────────────

await connectDatabase(env.MONGODB_URI);
logger.info('Worker: database connected');

configureAuditService(AuditEvent);

// ── Redis + BullMQ worker ──────────────────────────────────────────────────────

const redis = createRedisConnection(env.REDIS_CONNECTION);

redis.on('error', (err) => {
  logger.error('Worker: Redis connection error', { error: classifyRedisError(err) });
});

// Expose queue to job handlers that need to enqueue follow-on jobs
const queue = createDeploymentQueue(redis);
const notificationQueue = createNotificationQueue(redis);
setWorkerQueue(queue);
setNotificationQueue(notificationQueue);
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
    case JobType.ACTIVATE_DOMAIN:
      await handleActivateDomain(job);
      break;
    case JobType.REMOVE_DOMAIN:
      await handleRemoveDomain(job);
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
const notificationWorker = createNotificationWorker(
  redis,
  async (job) => {
    validateJobPayload(job.name, job.data);
    await handleSendNotification(job);
  },
  env.NOTIFICATION_WORKER_CONCURRENCY,
);

await sweepNotifications({ queue: notificationQueue });
const notificationSweepInterval = setInterval(
  () => sweepNotifications({ queue: notificationQueue }).catch(() => {}),
  60_000,
);
notificationSweepInterval.unref();

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
  workers: [worker, notificationWorker],
  closeRedis: async () => {
    clearInterval(notificationSweepInterval);
    await Promise.all([queue.close(), notificationQueue.close()]);
    await redis.quit();
  },
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
