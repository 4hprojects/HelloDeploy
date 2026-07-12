export const WEB_SHUTDOWN_TIMEOUT_MS = 25_000;

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export function createGracefulShutdown({
  server,
  closeQueue,
  closeDatabase,
  logger,
  timeoutMs = WEB_SHUTDOWN_TIMEOUT_MS,
}) {
  let shutdownPromise = null;

  return function shutdown(signal) {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      logger.info(`[web] ${signal} received — draining connections`);
      let timeout;
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('graceful shutdown deadline exceeded')),
          timeoutMs,
        );
      });

      try {
        await Promise.race([
          (async () => {
            await closeHttpServer(server);
            await Promise.allSettled([closeQueue(), closeDatabase()]).then((results) => {
              const failure = results.find((result) => result.status === 'rejected');
              if (failure) {
                throw failure.reason;
              }
            });
          })(),
          deadline,
        ]);
        logger.info('[web] Graceful shutdown complete');
        return { ok: true };
      } catch (err) {
        logger.error('[web] Graceful shutdown failed', { error: err.message });
        server.closeAllConnections?.();
        return { ok: false, error: err };
      } finally {
        clearTimeout(timeout);
      }
    })();

    return shutdownPromise;
  };
}
