#!/usr/bin/env node
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import {
  classifyRedisError,
  createDeploymentQueue,
  createRedisConnection,
} from '@hellodeploy/queue';
import { parseIntegerEnv } from '@hellodeploy/contracts';

const DEFAULT_DRAIN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function pauseAndDrainQueue(
  queue,
  {
    timeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    now = Date.now,
    waitFn = wait,
  } = {},
) {
  const wasPaused = await queue.isPaused();
  if (!wasPaused) {
    await queue.pause();
  }

  try {
    const deadline = now() + timeoutMs;
    while (true) {
      const { active = 0 } = await queue.getJobCounts('active');
      if (active === 0) {
        return { pausedByCommand: !wasPaused };
      }
      if (now() >= deadline) {
        throw new Error('Deployment queue drain deadline exceeded.');
      }
      await waitFn(pollIntervalMs);
    }
  } catch (error) {
    if (!wasPaused) {
      await queue.resume();
    }
    throw error;
  }
}

export async function resumeQueueFromState(queue, state) {
  if (state?.pausedByCommand) {
    await queue.resume();
    return true;
  }
  return false;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const stateFile = argumentValue('--state-file');
  if (!['pause-and-drain', 'resume'].includes(command) || !stateFile) {
    process.stderr.write(
      'Usage: node scripts/queue-maintenance.js pause-and-drain|resume --state-file <path>\n',
    );
    process.exitCode = 1;
    return;
  }

  const connection = createRedisConnection({
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseIntegerEnv('REDIS_PORT', process.env.REDIS_PORT || '6379', {
      min: 1,
      max: 65535,
    }),
    password: process.env.REDIS_PASSWORD,
    production: process.env.NODE_ENV === 'production',
  });
  const queue = createDeploymentQueue(connection);

  try {
    if (command === 'pause-and-drain') {
      const timeoutMs = parseIntegerEnv(
        'HELLODEPLOY_UPGRADE_DRAIN_TIMEOUT_MS',
        process.env.HELLODEPLOY_UPGRADE_DRAIN_TIMEOUT_MS || String(DEFAULT_DRAIN_TIMEOUT_MS),
        { min: 1000, max: 60 * 60 * 1000 },
      );
      const state = await pauseAndDrainQueue(queue, { timeoutMs });
      await writeFile(stateFile, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      process.stdout.write('Deployment queue paused and active jobs drained.\n');
    } else {
      const state = JSON.parse(await readFile(stateFile, 'utf8'));
      const resumed = await resumeQueueFromState(queue, state);
      process.stdout.write(
        resumed
          ? 'Deployment queue resumed.\n'
          : 'Deployment queue was already paused; leaving it paused.\n',
      );
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const failure =
      error.message === 'Deployment queue drain deadline exceeded.'
        ? error.message
        : classifyRedisError(error);
    process.stderr.write(`Queue maintenance failed: ${failure}\n`);
    process.exitCode = 1;
  });
}
