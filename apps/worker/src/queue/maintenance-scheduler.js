import { JobType, JobRetryPolicy } from '@hellodeploy/contracts';

/**
 * Stable identifier for the recurring maintenance sweep. BullMQ upserts on this
 * key, so changing the interval updates the existing schedule rather than
 * creating a second one.
 */
export const MAINTENANCE_SCHEDULER_ID = 'cleanup-releases-sweep';

/**
 * Register the recurring release-cleanup sweep on the deployment queue.
 *
 * Runs in the worker process rather than as a systemd timer because the sweep
 * needs the worker's Docker and database access, and because the platform is
 * mid-transition between systemd and PM2 — a timer would silently not exist
 * under PM2.
 *
 * An empty payload means "every project": the CLEANUP_RELEASES handler treats a
 * missing projectId as a global sweep.
 *
 * @param {import('bullmq').Queue} queue
 * @param {{ intervalMs: number }} options
 * @returns {Promise<void>}
 */
export async function registerMaintenanceSchedulers(queue, { intervalMs }) {
  const retryPolicy = JobRetryPolicy[JobType.CLEANUP_RELEASES];

  await queue.upsertJobScheduler(
    MAINTENANCE_SCHEDULER_ID,
    { every: intervalMs },
    {
      name: JobType.CLEANUP_RELEASES,
      data: {},
      // upsertJobScheduler bypasses enqueueJob, so the shared retry policy has
      // to be applied here explicitly.
      opts: {
        attempts: retryPolicy.attempts,
        backoff: retryPolicy.backoff,
      },
    },
  );
}
