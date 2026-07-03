import { env } from './config/env.js';
import { connectDatabase, AuditEvent } from '@hellodeploy/database';
import { configureAuditService, logger } from '@hellodeploy/observability';
import { createApp } from './app.js';
import { getRedisConnection } from './queue/client.js';

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

  app.listen(env.PORT, env.HOST, () => {
    logger.info(`[web] HelloDeploy web server running at http://${env.HOST}:${env.PORT}`, {
      env: env.NODE_ENV,
    });
  });
}

start().catch((err) => {
  process.stderr.write(`[web] Fatal startup error: ${err.message}\n`);
  process.exit(1);
});
