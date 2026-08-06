import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatWorkerReadinessLine } from '../../scripts/check-worker-readiness.js';

describe('candidate worker readiness output', () => {
  it('formats a passed line when a worker is connected', () => {
    assert.equal(
      formatWorkerReadinessLine({ ready: true, connectedWorkers: 1 }),
      'worker_ready=passed',
    );
  });

  it('formats a failed line when no worker is connected', () => {
    assert.equal(
      formatWorkerReadinessLine({ ready: false, connectedWorkers: 0 }),
      'worker_ready=failed',
    );
  });
});
