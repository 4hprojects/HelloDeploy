export const WORKER_SHUTDOWN_TIMEOUT_MS = 110_000;

/**
 * Drain the BullMQ worker within a bound that leaves systemd time to enforce
 * process termination. A missed deadline forces the worker closed and returns
 * a failure so the service exits nonzero.
 */
export function createGracefulWorkerShutdown({
  worker,
  closeRedis,
  closeDatabase,
  logger,
  timeoutMs = WORKER_SHUTDOWN_TIMEOUT_MS,
}) {
  let shutdownPromise = null;
  let dependencyClosePromise = null;

  function closeDependencies() {
    dependencyClosePromise ??= Promise.allSettled([closeRedis(), closeDatabase()]);
    return dependencyClosePromise;
  }

  return function shutdown(signal) {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      logger.info(`Worker: ${signal} received — draining active jobs`);
      let timeout;
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('worker shutdown deadline exceeded')),
          timeoutMs,
        );
      });

      try {
        await Promise.race([worker.close(), deadline]);
        const results = await closeDependencies();
        const failure = results.find((result) => result.status === 'rejected');
        if (failure) {
          throw failure.reason;
        }
        logger.info('Worker: graceful shutdown complete');
        return { ok: true };
      } catch (error) {
        logger.error('Worker: graceful shutdown failed', { errorType: error?.name ?? 'Error' });
        await Promise.allSettled([worker.close(true), closeDependencies()]);
        return { ok: false, error };
      } finally {
        clearTimeout(timeout);
      }
    })();

    return shutdownPromise;
  };
}
