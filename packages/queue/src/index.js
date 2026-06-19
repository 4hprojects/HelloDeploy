import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { JobRetryPolicy } from '@hellodeploy/contracts';

// ─── Redis connection ──────────────────────────────────────────────────────────

/**
 * Create an ioredis connection for BullMQ.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 *
 * @param {{ host: string, port: number, password?: string }} config
 * @returns {Redis}
 */
export function createRedisConnection({ host, port, password }) {
  return new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

// ─── Queue (producer — web process only) ──────────────────────────────────────

const DEPLOYMENT_QUEUE_NAME = 'deployments';

/**
 * Create the deployment BullMQ Queue (used by the web process to enqueue jobs).
 *
 * @param {Redis} connection
 * @returns {Queue}
 */
export function createDeploymentQueue(connection) {
  return new Queue(DEPLOYMENT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });
}

/**
 * Enqueue a deployment job.
 * Applies the retry policy from contracts.
 *
 * @param {Queue} queue
 * @param {string} jobType - One of JobType.*
 * @param {object} payload - Must match the corresponding *Payload typedef
 * @param {{ jobId?: string }} [opts]
 * @returns {Promise<import('bullmq').Job>}
 */
export async function enqueueJob(queue, jobType, payload, opts = {}) {
  const retryPolicy = JobRetryPolicy[jobType] ?? { attempts: 1, backoff: { type: 'fixed', delay: 0 } };
  return queue.add(jobType, payload, {
    attempts: retryPolicy.attempts,
    backoff: retryPolicy.backoff,
    jobId: opts.jobId,
    ...opts,
  });
}

// ─── Worker (consumer — worker process only) ───────────────────────────────────

/**
 * Create a BullMQ Worker to process deployment jobs.
 *
 * @param {Redis} connection
 * @param {(job: import('bullmq').Job) => Promise<void>} processor
 * @param {number} concurrency
 * @returns {Worker}
 */
export function createDeploymentWorker(connection, processor, concurrency = 1) {
  const worker = new Worker(DEPLOYMENT_QUEUE_NAME, processor, {
    connection,
    concurrency,
    lockDuration: 10 * 60 * 1000, // 10 minutes — long enough for docker build
  });
  return worker;
}
