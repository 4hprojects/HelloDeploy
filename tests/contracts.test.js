import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PlatformRole,
  ProjectRole,
  UserStatus,
  DeploymentStatus,
  JobType,
  validateJobPayload,
  JobPayloadValidationError,
} from '@hellodeploy/contracts';

describe('contracts — enums', () => {
  it('PlatformRole has expected values', () => {
    assert.equal(PlatformRole.SUPER_ADMIN, 'SUPER_ADMIN');
    assert.equal(PlatformRole.ADMIN, 'ADMIN');
    assert.equal(PlatformRole.USER, 'USER');
  });

  it('ProjectRole has expected values', () => {
    assert.equal(ProjectRole.OWNER, 'OWNER');
    assert.equal(ProjectRole.MAINTAINER, 'MAINTAINER');
    assert.equal(ProjectRole.VIEWER, 'VIEWER');
  });

  it('UserStatus covers full lifecycle', () => {
    const statuses = Object.values(UserStatus);
    assert.ok(statuses.includes('PENDING_VERIFICATION'));
    assert.ok(statuses.includes('ACTIVE'));
    assert.ok(statuses.includes('SUSPENDED'));
    assert.ok(statuses.includes('ARCHIVED'));
  });

  it('DeploymentStatus covers full lifecycle', () => {
    const statuses = Object.values(DeploymentStatus);
    assert.ok(statuses.includes('QUEUED'));
    assert.ok(statuses.includes('BUILDING'));
    assert.ok(statuses.includes('HEALTHY'));
    assert.ok(statuses.includes('FAILED'));
    assert.ok(statuses.includes('CANCELLED'));
  });

  it('enums are frozen (immutable)', () => {
    assert.ok(Object.isFrozen(PlatformRole));
    assert.ok(Object.isFrozen(DeploymentStatus));
  });
});

describe('contracts — JobType', () => {
  it('has all 12 job types', () => {
    const types = Object.values(JobType);
    assert.equal(types.length, 12);
  });

  it('all job types are strings', () => {
    for (const value of Object.values(JobType)) {
      assert.equal(typeof value, 'string');
    }
  });
});

describe('contracts — validateJobPayload', () => {
  it('accepts a well-formed BUILD_DEPLOYMENT payload', () => {
    assert.doesNotThrow(() =>
      validateJobPayload(JobType.BUILD_DEPLOYMENT, {
        projectId: 'p1',
        deploymentId: 'd1',
        commitSha: 'a'.repeat(40),
        repositoryId: 'r1',
        runtimeType: 'NODEJS',
        imageTag: 'hd-app-1',
      }),
    );
  });

  it('rejects a BUILD_DEPLOYMENT payload missing a required field', () => {
    assert.throws(
      () =>
        validateJobPayload(JobType.BUILD_DEPLOYMENT, {
          projectId: 'p1',
          deploymentId: 'd1',
          commitSha: 'a'.repeat(40),
          repositoryId: 'r1',
          // runtimeType and imageTag missing
        }),
      JobPayloadValidationError,
    );
  });

  it('rejects a non-object payload', () => {
    assert.throws(() => validateJobPayload(JobType.STOP_PROJECT, null), JobPayloadValidationError);
  });

  it('rejects SET_PROJECT_MAINTENANCE when enabled is not a boolean', () => {
    assert.throws(
      () =>
        validateJobPayload(JobType.SET_PROJECT_MAINTENANCE, {
          projectId: 'p1',
          enabled: 'true',
        }),
      JobPayloadValidationError,
    );
  });

  it('is a no-op for job types without a registered validator', () => {
    assert.doesNotThrow(() => validateJobPayload(JobType.COLLECT_METRICS, {}));
  });

  it('allows CLEANUP_RELEASES with no payload fields at all', () => {
    assert.doesNotThrow(() => validateJobPayload(JobType.CLEANUP_RELEASES, {}));
  });

  it('validates the complete version-2 project deletion inventory', () => {
    assert.doesNotThrow(() =>
      validateJobPayload(JobType.DELETE_PROJECT, {
        version: 2,
        projectId: 'p1',
        projectSlug: 'my-project',
        containerIds: ['container-1'],
        imageTags: ['image-1'],
      }),
    );
    assert.throws(
      () =>
        validateJobPayload(JobType.DELETE_PROJECT, {
          version: 2,
          projectId: 'p1',
          projectSlug: 'my-project',
          containerIds: 'container-1',
          imageTags: [],
        }),
      JobPayloadValidationError,
    );
  });
});
