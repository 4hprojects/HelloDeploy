let _queue = null;

/**
 * Set the shared queue instance (called from worker.js during startup).
 * Job handlers use getWorkerQueue() to enqueue follow-on jobs.
 */
export function setWorkerQueue(queue) {
  _queue = queue;
}

export function getWorkerQueue() {
  return _queue;
}
