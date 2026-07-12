import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkWorkerReadiness } from '../../apps/web/src/services/worker-readiness.service.js';

describe('admin worker readiness', () => {
  it('reports ready with only a sanitized connected-worker count', async () => {
    const result = await checkWorkerReadiness({
      getWorkersCount: async () => 2,
      getWorkers: async () => [{ addr: 'redis.internal:6379', name: 'private-worker-name' }],
    });

    assert.deepEqual(result, { ready: true, connectedWorkers: 2 });
    assert.doesNotMatch(JSON.stringify(result), /redis\.internal|private-worker-name/);
  });

  it('reports unavailable when no worker is connected', async () => {
    const result = await checkWorkerReadiness({ getWorkersCount: async () => 0 });

    assert.deepEqual(result, { ready: false, connectedWorkers: 0 });
  });

  it('fails closed without exposing queue errors', async () => {
    const result = await checkWorkerReadiness({
      getWorkersCount: async () => {
        throw new Error('redis://user:secret@internal-host:6379');
      },
    });

    assert.deepEqual(result, { ready: false, connectedWorkers: null });
    assert.doesNotMatch(JSON.stringify(result), /secret|internal-host/);
  });

  it('reports unavailable when the deployment queue is not initialized', async () => {
    assert.deepEqual(await checkWorkerReadiness(null), {
      ready: false,
      connectedWorkers: 0,
    });
  });
});
