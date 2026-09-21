#!/usr/bin/env node
import 'dotenv/config';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createDeploymentQueue, createRedisConnection } from '@hellodeploy/queue';

const DEFAULT_LIMIT = 20;

/**
 * Render one failed job as a single sanitized line.
 *
 * Job payloads carry identifiers, never secrets, but the failure reason comes
 * from arbitrary downstream code — so it is truncated and newline-stripped
 * rather than echoed whole.
 */
export function formatFailedJobLine(job) {
  const reason = (job.failedReason ?? 'unknown').replace(/\s+/g, ' ').slice(0, 200);
  return [
    `id=${job.id}`,
    `type=${job.name}`,
    `attempts=${job.attemptsMade}`,
    `projectId=${job.data?.projectId ?? '-'}`,
    `deploymentId=${job.data?.deploymentId ?? '-'}`,
    `reason=${reason}`,
  ].join(' ');
}

export function formatFailedJobSummary(total, shown) {
  return `failed_jobs=${total} shown=${shown}`;
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg === -1 ? DEFAULT_LIMIT : Number(process.argv[limitArg + 1]);

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    process.stderr.write('Usage: node scripts/inspect-failed-jobs.js [--limit <1-500>]\n');
    process.exitCode = 1;
    return;
  }

  const connection = createRedisConnection({
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    production: process.env.NODE_ENV === 'production',
  });
  const queue = createDeploymentQueue(connection);

  try {
    const total = await queue.getFailedCount();
    const jobs = await queue.getFailed(0, limit - 1);

    for (const job of jobs) {
      process.stdout.write(`${formatFailedJobLine(job)}\n`);
    }
    process.stdout.write(`${formatFailedJobSummary(total, jobs.length)}\n`);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
