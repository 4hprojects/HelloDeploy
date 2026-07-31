import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase, AuditEvent } from '@hellodeploy/database';
import { configureAuditService, logger } from '@hellodeploy/observability';
import { createApp } from './app.js';
import { closeDeploymentQueue, getRedisConnection } from './queue/client.js';
import { createGracefulShutdown, createShutdownSignalHandler } from './lifecycle.js';

async function start() {
  logger.info('[web] Connecting to MongoDB…');
  await connectDatabase(env.MONGODB_URI);
  logger.info('[web] MongoDB connected');

  // Warm the shared Redis connection now: webhook dedup only trusts Redis once
  // the client is ready, and a lazily created client would leave each
  // instance's first webhooks deduplicated in-memory only.
  getRedisConnection();

  configureAuditService(AuditEvent);

  const app = createApp();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`[web] HelloDeploy web server running at http://${env.HOST}:${env.PORT}`, {
      env: env.NODE_ENV,
    });
  });

  const shutdown = createGracefulShutdown({
    server,
    closeQueue: closeDeploymentQueue,
    closeDatabase: disconnectDatabase,
    logger,
  });
  const handleShutdownSignal = createShutdownSignalHandler({ shutdown });
  process.once('SIGTERM', () => handleShutdownSignal('SIGTERM'));
  process.once('SIGINT', () => handleShutdownSignal('SIGINT'));
}

await start();
