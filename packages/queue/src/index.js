import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { JobRetryPolicy } from '@hellodeploy/contracts';

// ─── Redis connection ──────────────────────────────────────────────────────────

/**
 * Create an ioredis connection for BullMQ.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 *
 * @param {{ url?: string, host?: string, port?: number, password?: string, production?: boolean }} config
 * @returns {Redis}
 */
export function createRedisConnection(config) {
  const { connection } = resolveRedisConnectionConfig(config);
  const options = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  };

  if (connection.url) {
    return new Redis(connection.url, options);
  }

  return new Redis({ ...connection, ...options });
}

function isLoopbackHost(host) {
  const normalized = String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' || normalized === '::1' || /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

/**
 * Normalize and validate Redis configuration without opening a connection.
 * Remote production Redis must use TLS; errors intentionally exclude endpoints.
 */
export function resolveRedisConnectionConfig({
  url,
  host = '127.0.0.1',
  port = 6379,
  password,
  production = false,
} = {}) {
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL.');
    }
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      throw new Error('REDIS_URL must use redis:// or rediss://.');
    }
    if (production && parsed.protocol !== 'rediss:' && !isLoopbackHost(parsed.hostname)) {
      throw new Error('Remote production Redis requires a rediss:// URL.');
    }
    return {
      mode: parsed.protocol === 'rediss:' ? 'managed-tls-url' : 'local-url',
      connection: { url },
    };
  }

  if (production && !isLoopbackHost(host)) {
    throw new Error('Remote production Redis requires REDIS_URL with rediss://.');
  }
  return {
    mode: isLoopbackHost(host) ? 'local-split' : 'remote-split',
    connection: { host, port, password: password || undefined },
  };
}

export function classifyRedisError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
    return code;
  }
  return 'REDIS_ERROR';
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
  const retryPolicy = JobRetryPolicy[jobType] ?? {
    attempts: 1,
    backoff: { type: 'fixed', delay: 0 },
  };
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
