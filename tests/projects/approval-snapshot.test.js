import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DeploymentMode, DetectionStatus, RuntimeType } from '@hellodeploy/contracts';

import { isApprovalSnapshotCurrent } from '../../apps/web/src/services/approval-readiness.service.js';

const COMMIT = 'a'.repeat(40);
const NEWER_COMMIT = 'b'.repeat(40);

const repository = { _id: 'repo-1', accessStatus: 'ACTIVE', lastCommitSha: COMMIT };

/** A static site that passes every readiness check at COMMIT, configuration version 3. */
function readyProject(overrides = {}) {
  return {
    repositoryId: 'repo-1',
    productionBranch: 'main',
    runtimeType: RuntimeType.STATIC,
    detection: { status: DetectionStatus.READY, checkedCommitSha: COMMIT },
    buildConfiguration: { outputDirectory: 'dist', healthCheckPath: '/' },
    deploymentMode: DeploymentMode.MANUAL,
    configurationVersion: 3,
    ...overrides,
  };
}

function check({ request, project = readyProject(), repo = repository }) {
  return isApprovalSnapshotCurrent({ request, project, repository: repo });
}

describe('isApprovalSnapshotCurrent', () => {
  it('accepts a request taken at the current commit and configuration', () => {
    const result = check({
      request: { snapshotConfigurationVersion: 3, snapshotCommitSha: COMMIT },
    });
    assert.equal(result.isCurrent, true);
  });

  it('matches the commit regardless of letter case', () => {
    const result = check({
      request: { snapshotConfigurationVersion: 3, snapshotCommitSha: COMMIT.toUpperCase() },
    });
    assert.equal(result.isCurrent, true);
  });

  it('is stale once the settings change after submission', () => {
    const result = check({
      request: { snapshotConfigurationVersion: 2, snapshotCommitSha: COMMIT },
    });
    assert.equal(result.configurationMatches, false);
  });

  it('is stale once new code is pushed after submission', () => {
    const result = check({
      request: { snapshotConfigurationVersion: 3, snapshotCommitSha: COMMIT },
      repo: { ...repository, lastCommitSha: NEWER_COMMIT },
    });
    assert.equal(result.commitMatches, false);
  });

  it('treats a request without a snapshot as not current', () => {
    const result = check({ request: {} });
    assert.deepEqual(
      { isCurrent: result.isCurrent, hasSnapshot: result.hasSnapshot },
      { isCurrent: false, hasSnapshot: false },
    );
  });

  it('is not current when the project is no longer ready, even with a matching snapshot', () => {
    const result = check({
      request: { snapshotConfigurationVersion: 3, snapshotCommitSha: COMMIT },
      repo: { ...repository, accessStatus: 'REVOKED' },
    });
    assert.equal(result.isCurrent, false);
  });
});
