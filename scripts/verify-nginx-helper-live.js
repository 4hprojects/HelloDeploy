#!/usr/bin/env node
import 'dotenv/config';

import { access, readFile } from 'node:fs/promises';

import { createDeploymentQueue, createRedisConnection } from '@hellodeploy/queue';

import {
  activateRoute,
  removeRoute,
  validateNginxConfig,
} from '../apps/worker/src/nginx/helper-client.js';

const PROBE_SLUG = 'zz-hd-p2-routing-probe';
const PROBE_PORT = 18080;
const PROBE_FILE = `/etc/nginx/hellodeploy.d/${PROBE_SLUG}.conf`;

function probeConfig(status) {
  return `server {
    listen 127.0.0.1:${PROBE_PORT};
    server_name ${PROBE_SLUG}.invalid;
    location / {
        return ${status};
    }
}
`;
}

async function assertQueuePaused() {
  const connection = createRedisConnection({
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    production: process.env.NODE_ENV === 'production',
  });
  const queue = createDeploymentQueue(connection);

  try {
    if (!(await queue.isPaused())) {
      throw new Error('Deployment queue must be paused before routing activation.');
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
}

async function requestProbe(expectedStatus) {
  const response = await fetch(`http://127.0.0.1:${PROBE_PORT}/`, {
    headers: { connection: 'close' },
    signal: AbortSignal.timeout(2_000),
  });
  if (response.status !== expectedStatus) {
    throw new Error('Nginx routing probe returned an unexpected status.');
  }
}

async function assertProbeUnavailable() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${PROBE_PORT}/`, {
        headers: { connection: 'close' },
        signal: AbortSignal.timeout(500),
      });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Removed Nginx routing probe is still reachable.');
}

async function assertProbeFileAbsent() {
  try {
    await access(PROBE_FILE);
    throw new Error('Routing probe file already exists.');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function main() {
  await assertQueuePaused();
  process.stdout.write('queue_pause_check=passed\n');

  if (process.argv.includes('--check-queue-only')) {
    return;
  }

  await assertProbeFileAbsent();
  await validateNginxConfig();

  let probeCreated = false;
  try {
    await activateRoute({ slug: PROBE_SLUG, configContent: probeConfig(204) });
    probeCreated = true;
    await requestProbe(204);
    process.stdout.write('route_creation=passed\n');

    await activateRoute({ slug: PROBE_SLUG, configContent: probeConfig(202) });
    await requestProbe(202);
    process.stdout.write('route_replacement=passed\n');

    let invalidRejected = false;
    try {
      await activateRoute({
        slug: PROBE_SLUG,
        configContent: 'server { not_a_valid_nginx_directive on; }\n',
      });
    } catch {
      invalidRejected = true;
    }
    if (!invalidRejected) {
      throw new Error('Invalid Nginx candidate was accepted.');
    }
    await requestProbe(202);
    if (!(await readFile(PROBE_FILE, 'utf8')).includes('return 202;')) {
      throw new Error('Prior Nginx route was not restored.');
    }
    process.stdout.write('invalid_candidate_restore=passed\n');

    await removeRoute({ slug: PROBE_SLUG });
    probeCreated = false;
    await assertProbeUnavailable();
    await assertProbeFileAbsent();
    process.stdout.write('route_removal=passed\n');
  } finally {
    if (probeCreated) {
      await removeRoute({ slug: PROBE_SLUG }).catch(() => {});
    }
  }
}

main().catch(() => {
  process.stderr.write('Live Nginx helper verification failed.\n');
  process.exitCode = 1;
});
