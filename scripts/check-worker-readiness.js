#!/usr/bin/env node
import 'dotenv/config';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createDeploymentQueue, createRedisConnection } from '@hellodeploy/queue';

import { checkWorkerReadiness } from '../apps/web/src/services/worker-readiness.service.js';

export function formatWorkerReadinessLine(result) {
  return `worker_ready=${result.ready ? 'passed' : 'failed'}`;
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
    const result = await checkWorkerReadiness(queue);
    process.stdout.write(`${formatWorkerReadinessLine(result)}\n`);
    process.exitCode = result.ready ? 0 : 1;
  } finally {
    await queue.close();
    await connection.quit();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
