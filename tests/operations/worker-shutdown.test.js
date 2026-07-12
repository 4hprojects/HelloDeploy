import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { WEB_SHUTDOWN_TIMEOUT_MS } from '../../apps/web/src/lifecycle.js';
import {
  createGracefulWorkerShutdown,
  WORKER_SHUTDOWN_TIMEOUT_MS,
} from '../../apps/worker/src/lifecycle.js';

function createLogger() {
  return { info() {}, error() {} };
}

describe('worker graceful shutdown', () => {
  it('keeps application deadlines below their systemd stop windows', async () => {
    const webService = await readFile(
      new URL('../../infrastructure/systemd/hellodeploy-web.service', import.meta.url),
      'utf8',
    );
    const workerService = await readFile(
      new URL('../../infrastructure/systemd/hellodeploy-worker.service', import.meta.url),
      'utf8',
    );
    const webStopMs = Number(webService.match(/TimeoutStopSec=(\d+)/)?.[1]) * 1000;
    const workerStopMs = Number(workerService.match(/TimeoutStopSec=(\d+)/)?.[1]) * 1000;

    assert.ok(WEB_SHUTDOWN_TIMEOUT_MS < webStopMs);
    assert.ok(WORKER_SHUTDOWN_TIMEOUT_MS < workerStopMs);
  });

  it('drains once and closes Redis and MongoDB', async () => {
    const calls = [];
    const shutdown = createGracefulWorkerShutdown({
      worker: { close: async (force) => calls.push(['worker', force]) },
      closeRedis: async () => calls.push(['redis']),
      closeDatabase: async () => calls.push(['database']),
      logger: createLogger(),
      timeoutMs: 100,
    });

    const first = shutdown('SIGTERM');
    const second = shutdown('SIGINT');
    assert.strictEqual(first, second);
    assert.deepEqual(await first, { ok: true });
    assert.deepEqual(calls, [['worker', undefined], ['redis'], ['database']]);
  });

  it('forces the worker closed and fails when the drain deadline expires', async () => {
    const calls = [];
    const shutdown = createGracefulWorkerShutdown({
      worker: {
        close: (force) => {
          calls.push(['worker', force]);
          return force ? Promise.resolve() : new Promise(() => {});
        },
      },
      closeRedis: async () => calls.push(['redis']),
      closeDatabase: async () => calls.push(['database']),
      logger: createLogger(),
      timeoutMs: 5,
    });

    const result = await shutdown('SIGTERM');

    assert.equal(result.ok, false);
    assert.match(result.error.message, /deadline/);
    assert.deepEqual(calls, [['worker', undefined], ['worker', true], ['redis'], ['database']]);
  });

  it('fails safely when a dependency cannot close', async () => {
    const calls = [];
    const shutdown = createGracefulWorkerShutdown({
      worker: { close: async (force) => calls.push(['worker', force]) },
      closeRedis: async () => {
        calls.push(['redis']);
        throw new Error('redis close failed');
      },
      closeDatabase: async () => calls.push(['database']),
      logger: createLogger(),
      timeoutMs: 100,
    });

    const result = await shutdown('SIGTERM');

    assert.equal(result.ok, false);
    assert.equal(calls.filter(([name]) => name === 'worker').length, 2);
  });
});
