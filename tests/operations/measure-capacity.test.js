import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { createLoadPlan, summarizeDurations } = await import('../../scripts/measure-capacity.js');

describe('measure-capacity helpers', () => {
  it('clamps load plan values to safe local limits', () => {
    assert.deepEqual(createLoadPlan({ requests: 5000, concurrency: 500 }), {
      requests: 1000,
      concurrency: 50,
    });
  });

  it('keeps concurrency no higher than request count', () => {
    assert.deepEqual(createLoadPlan({ requests: 3, concurrency: 10 }), {
      requests: 3,
      concurrency: 3,
    });
  });

  it('summarizes latency samples', () => {
    assert.deepEqual(summarizeDurations([30.2, 10.4, 20.8]), {
      minMs: 10,
      p50Ms: 21,
      p95Ms: 30,
      maxMs: 30,
    });
  });

  it('returns null for empty latency samples', () => {
    assert.equal(summarizeDurations([]), null);
  });
});
