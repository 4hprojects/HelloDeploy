/**
 * Report whether BullMQ can see a worker for the deployment queue.
 * Only availability and count are returned, never Redis client metadata such
 * as addresses or connection names.
 *
 * @param {import('bullmq').Queue | null} queue
 * @returns {Promise<{ready: boolean, connectedWorkers: number | null}>}
 */
export async function checkWorkerReadiness(queue) {
  if (!queue) {
    return { ready: false, connectedWorkers: 0 };
  }

  try {
    const connectedWorkers = await queue.getWorkersCount();
    return { ready: connectedWorkers > 0, connectedWorkers };
  } catch {
    return { ready: false, connectedWorkers: null };
  }
}
