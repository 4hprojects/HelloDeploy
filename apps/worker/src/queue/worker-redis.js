let _redis = null;

/**
 * Share the worker's Redis connection (set from worker.js during startup)
 * with modules that publish on it, e.g. live deploy-log events.
 */
export function setWorkerRedis(redis) {
  _redis = redis;
}

export function getWorkerRedis() {
  return _redis;
}
