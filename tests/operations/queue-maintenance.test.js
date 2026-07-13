import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pauseAndDrainQueue, resumeQueueFromState } from '../../scripts/queue-maintenance.js';

describe('upgrade queue maintenance', () => {
  it('pauses an active queue and waits for active jobs to drain', async () => {
    const calls = [];
    const activeCounts = [2, 1, 0];
    const result = await pauseAndDrainQueue(
      {
        isPaused: async () => false,
        pause: async () => calls.push('pause'),
        getJobCounts: async () => ({ active: activeCounts.shift() }),
      },
      { timeoutMs: 100, pollIntervalMs: 1, now: () => 0, waitFn: async () => calls.push('wait') },
    );
    assert.deepEqual(result, { pausedByCommand: true });
    assert.deepEqual(calls, ['pause', 'wait', 'wait']);
  });

  it('preserves an operator-paused queue', async () => {
    let pauseCalls = 0;
    const result = await pauseAndDrainQueue({
      isPaused: async () => true,
      pause: async () => pauseCalls++,
      getJobCounts: async () => ({ active: 0 }),
    });
    assert.deepEqual(result, { pausedByCommand: false });
    assert.equal(pauseCalls, 0);
  });

  it('fails when active jobs exceed the drain deadline', async () => {
    let currentTime = 0;
    let resumes = 0;
    await assert.rejects(
      pauseAndDrainQueue(
        {
          isPaused: async () => false,
          pause: async () => {},
          resume: async () => resumes++,
          getJobCounts: async () => ({ active: 1 }),
        },
        {
          timeoutMs: 2,
          pollIntervalMs: 1,
          now: () => currentTime,
          waitFn: async () => currentTime++,
        },
      ),
      /drain deadline exceeded/,
    );
    assert.equal(resumes, 1);
  });

  it('resumes only when the upgrade paused the queue', async () => {
    let resumes = 0;
    const queue = { resume: async () => resumes++ };
    assert.equal(await resumeQueueFromState(queue, { pausedByCommand: true }), true);
    assert.equal(await resumeQueueFromState(queue, { pausedByCommand: false }), false);
    assert.equal(resumes, 1);
  });
});
