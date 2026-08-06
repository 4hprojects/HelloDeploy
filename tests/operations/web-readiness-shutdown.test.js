import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createGracefulShutdown,
  createShutdownSignalHandler,
} from '../../apps/web/src/lifecycle.js';
import { checkWebReadiness } from '../../apps/web/src/services/readiness.service.js';

describe('web readiness', () => {
  it('is ready only when MongoDB, Redis, and the queue respond', async () => {
    const result = await checkWebReadiness({
      database: { readyState: 1 },
      redis: { status: 'ready' },
      queue: { getJobCounts: async () => ({ waiting: 0 }) },
    });
    assert.deepEqual(result, {
      ready: true,
      checks: { mongodb: true, redis: true, queue: true },
    });
  });

  it('reports sanitized component state when dependencies are unavailable', async () => {
    const result = await checkWebReadiness({
      database: { readyState: 0 },
      redis: { status: 'end' },
      queue: null,
    });
    assert.deepEqual(result, {
      ready: false,
      checks: { mongodb: false, redis: false, queue: false },
    });
  });

  it('becomes unready when the queue check fails', async () => {
    const result = await checkWebReadiness({
      database: { readyState: 1 },
      redis: { status: 'ready' },
      queue: { getJobCounts: async () => Promise.reject(new Error('internal address')) },
    });
    assert.equal(result.ready, false);
    assert.equal(result.checks.queue, false);
    assert.doesNotMatch(JSON.stringify(result), /internal address/);
  });
});

describe('web graceful shutdown', () => {
  it('drains HTTP before closing shared clients and is idempotent', async () => {
    const calls = [];
    const server = {
      close(callback) {
        calls.push('server');
        callback();
      },
    };
    const shutdown = createGracefulShutdown({
      server,
      closeQueue: async () => calls.push('queue'),
      closeDatabase: async () => calls.push('database'),
      logger: { info() {}, error() {} },
    });

    const first = shutdown('SIGTERM');
    const second = shutdown('SIGINT');
    assert.strictEqual(first, second);
    assert.deepEqual(await first, { ok: true });
    assert.equal(calls[0], 'server');
    assert.deepEqual(new Set(calls.slice(1)), new Set(['queue', 'database']));
  });

  it('waits for pending request-scoped work before closing shared clients', async () => {
    const calls = [];
    const shutdown = createGracefulShutdown({
      server: { close: (callback) => callback() },
      closeQueue: async () => calls.push('queue'),
      closeDatabase: async () => calls.push('database'),
      drainPendingWork: async () => {
        await new Promise((resolve) => setImmediate(resolve));
        calls.push('drain');
      },
      logger: { info() {}, error() {} },
    });

    await shutdown('SIGTERM');

    assert.equal(calls[0], 'drain');
    assert.deepEqual(new Set(calls.slice(1)), new Set(['queue', 'database']));
  });

  it('forces connections closed when the shutdown deadline expires', async () => {
    let forced = false;
    const shutdown = createGracefulShutdown({
      server: {
        close() {},
        closeAllConnections() {
          forced = true;
        },
      },
      closeQueue: async () => {},
      closeDatabase: async () => {},
      logger: { info() {}, error() {} },
      timeoutMs: 5,
    });

    const result = await shutdown('SIGTERM');
    assert.equal(result.ok, false);
    assert.equal(forced, true);
  });

  it('exits cleanly only after graceful shutdown succeeds', async () => {
    const calls = [];
    const handleSignal = createShutdownSignalHandler({
      shutdown: async (signal) => {
        calls.push(`shutdown:${signal}`);
        return { ok: true };
      },
      exitProcess: (code) => calls.push(`exit:${code}`),
    });

    handleSignal('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(calls, ['shutdown:SIGTERM', 'exit:0']);
  });

  it('exits unsuccessfully when graceful shutdown fails or rejects', async () => {
    const exitCodes = [];
    const failedResult = createShutdownSignalHandler({
      shutdown: async () => ({ ok: false }),
      exitProcess: (code) => exitCodes.push(code),
    });
    const rejected = createShutdownSignalHandler({
      shutdown: async () => Promise.reject(new Error('shutdown failed')),
      exitProcess: (code) => exitCodes.push(code),
    });

    failedResult('SIGTERM');
    rejected('SIGINT');
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(exitCodes, [1, 1]);
  });
});
