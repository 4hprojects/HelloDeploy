import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JobType, validateJobPayload } from '@hellodeploy/contracts';

/**
 * The worker passes commitSha straight into `git fetch` and `git checkout` argv.
 * Git reads a leading dash as an option, and `--upload-pack=<cmd>` runs a
 * command, so the queue boundary must not accept an arbitrary string.
 */
describe('build deployment payload commit SHA', () => {
  function payload(commitSha) {
    return {
      projectId: 'p1',
      deploymentId: 'd1',
      commitSha,
      repositoryId: 'r1',
      runtimeType: 'NODE',
      imageTag: 'tag',
    };
  }

  it('accepts a 40-character lowercase hex SHA', () => {
    assert.doesNotThrow(() =>
      validateJobPayload(JobType.BUILD_DEPLOYMENT, payload('a'.repeat(40))),
    );
  });

  it('rejects a value that git would read as an option', () => {
    assert.throws(
      () => validateJobPayload(JobType.BUILD_DEPLOYMENT, payload('--upload-pack=touch /tmp/pwned')),
      { code: 'JOB_PAYLOAD_INVALID' },
    );
  });

  it('rejects a short SHA', () => {
    assert.throws(() => validateJobPayload(JobType.BUILD_DEPLOYMENT, payload('abc1234')), {
      code: 'JOB_PAYLOAD_INVALID',
    });
  });

  it('rejects uppercase hex, which the web side never produces', () => {
    assert.throws(() => validateJobPayload(JobType.BUILD_DEPLOYMENT, payload('A'.repeat(40))), {
      code: 'JOB_PAYLOAD_INVALID',
    });
  });
});
