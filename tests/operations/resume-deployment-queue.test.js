import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatQueueResumeLine } from '../../scripts/resume-deployment-queue.js';

describe('deployment queue resume output', () => {
  it('formats a resumed line when the queue was paused', () => {
    assert.equal(formatQueueResumeLine(true), 'queue_state=resumed');
  });

  it('formats an unchanged line when the queue was not paused', () => {
    assert.equal(formatQueueResumeLine(false), 'queue_state=unchanged');
  });
});
