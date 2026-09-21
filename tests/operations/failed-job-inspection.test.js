import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { formatFailedJobLine, formatFailedJobSummary } =
  await import('../../scripts/inspect-failed-jobs.js');

describe('failed job inspection', () => {
  it('reports the identifiers an operator needs to find the deployment', () => {
    const line = formatFailedJobLine({
      id: '42',
      name: 'BUILD_DEPLOYMENT',
      attemptsMade: 3,
      data: { projectId: 'p1', deploymentId: 'd1' },
      failedReason: 'boom',
    });
    assert.equal(
      line,
      'id=42 type=BUILD_DEPLOYMENT attempts=3 projectId=p1 deploymentId=d1 reason=boom',
    );
  });

  it('collapses a multi-line failure reason onto one line', () => {
    const line = formatFailedJobLine({
      id: '1',
      name: 'X',
      attemptsMade: 1,
      data: {},
      failedReason: 'first\nsecond\n  third',
    });
    assert.ok(line.endsWith('reason=first second third'));
  });

  it('truncates an unbounded failure reason', () => {
    const line = formatFailedJobLine({
      id: '1',
      name: 'X',
      attemptsMade: 1,
      data: {},
      failedReason: 'x'.repeat(500),
    });
    assert.equal(line.split('reason=')[1].length, 200);
  });

  it('marks a job with no recorded reason rather than printing undefined', () => {
    const line = formatFailedJobLine({ id: '1', name: 'X', attemptsMade: 1, data: {} });
    assert.ok(line.endsWith('reason=unknown'));
  });

  it('distinguishes the total from the number displayed', () => {
    assert.equal(formatFailedJobSummary(500, 20), 'failed_jobs=500 shown=20');
  });
});
