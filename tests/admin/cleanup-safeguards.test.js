import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { isActiveDeploymentProtected } =
  await import('../../apps/worker/src/jobs/cleanup-releases.job.js');

describe('cleanup safeguards', () => {
  it('protects a deployment referenced as active by a project', () => {
    assert.equal(
      isActiveDeploymentProtected({ _id: 'deployment-1' }, new Set(['deployment-1'])),
      true,
    );
  });

  it('allows cleanup for deployments not referenced as active', () => {
    assert.equal(
      isActiveDeploymentProtected({ _id: 'deployment-2' }, new Set(['deployment-1'])),
      false,
    );
  });
});
