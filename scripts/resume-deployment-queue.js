#!/usr/bin/env node
import 'dotenv/config';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createDeploymentQueue, createRedisConnection } from '@hellodeploy/queue';

export function formatQueueResumeLine(wasPaused) {
  return `queue_state=${wasPaused ? 'resumed' : 'unchanged'}`;
}

async function main() {
  const connection = createRedisConnection({
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    production: process.env.NODE_ENV === 'production',
  });
  const queue = createDeploymentQueue(connection);

  try {
    const wasPaused = await queue.isPaused();
    if (!wasPaused) {
      process.stdout.write(`${formatQueueResumeLine(false)}\n`);
      process.stderr.write('Deployment queue was not paused; nothing to resume.\n');
      process.exitCode = 1;
      return;
    }
    await queue.resume();
    process.stdout.write(`${formatQueueResumeLine(true)}\n`);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
