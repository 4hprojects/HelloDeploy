import { Domain } from '@hellodeploy/database';
import { DomainStatus, JobType } from '@hellodeploy/contracts';
import { enqueueJob } from '@hellodeploy/queue';
import { logger } from '@hellodeploy/observability';
import { getWorkerQueue } from '../queue/worker-queue.js';

/**
 * How long a domain may sit unverified before the platform re-checks DNS for
 * the owner. Propagation is usually minutes; an hour means the record was
 * published late, edited, or never seen.
 */
export const DOMAIN_REVERIFY_AFTER_MS = 60 * 60 * 1000;

/** Bound the work a single sweep can enqueue. */
export const DOMAIN_REVERIFY_BATCH_LIMIT = 25;

/**
 * Re-check domains left in PENDING_VERIFICATION.
 *
 * Verification is otherwise one-shot and user-triggered: an owner who
 * published their TXT record after the first check has to notice nothing
 * happened and press the button again.
 *
 * @param {{ maxAgeMs?: number, limit?: number, now?: () => number, queue?: object }} [options]
 * @returns {Promise<number>} number of re-verifications enqueued
 */
export async function sweepUnverifiedDomains({
  maxAgeMs = DOMAIN_REVERIFY_AFTER_MS,
  limit = DOMAIN_REVERIFY_BATCH_LIMIT,
  now = Date.now,
  queue = getWorkerQueue(),
} = {}) {
  if (!queue) {
    logger.warn('DomainReverify: queue unavailable, skipping sweep');
    return 0;
  }

  const timestamp = now();
  const stale = await Domain.find({
    status: DomainStatus.PENDING_VERIFICATION,
    updatedAt: { $lt: new Date(timestamp - maxAgeMs) },
  })
    .select('_id projectId hostnameNormalized')
    .limit(limit)
    .lean();

  for (const domain of stale) {
    await enqueueJob(
      queue,
      JobType.VERIFY_DOMAIN,
      {
        version: 1,
        correlationId: `domain-reverify-${timestamp}`,
        actorId: null,
        actorRole: 'SYSTEM',
        domainId: domain._id.toString(),
        projectId: domain.projectId.toString(),
        hostname: domain.hostnameNormalized,
      },
      // The user-triggered path uses a stable verify-domain-<id> key. Reusing
      // it here would collide with the retained completed job and drop the
      // re-check silently, so each sweep gets its own key.
      { jobId: `domain-reverify-${domain._id}-${timestamp}` },
    );
  }

  if (stale.length > 0) {
    logger.info('DomainReverify: re-checks enqueued', { count: stale.length });
  }

  return stale.length;
}
