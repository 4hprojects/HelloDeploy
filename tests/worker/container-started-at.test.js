import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseContainerStartedAt } from '../../apps/worker/src/deployment/container.js';

describe('parseContainerStartedAt', () => {
  it('reads Docker nanosecond timestamps as a Date', () => {
    assert.deepEqual(
      parseContainerStartedAt('2026-10-15T08:12:33.123456789Z'),
      new Date('2026-10-15T08:12:33.123Z'),
    );
  });

  it('treats the zero time of a never-started container as unknown', () => {
    assert.equal(parseContainerStartedAt('0001-01-01T00:00:00Z'), null);
  });

  it('treats a missing value as unknown', () => {
    assert.equal(parseContainerStartedAt(undefined), null);
  });
});
