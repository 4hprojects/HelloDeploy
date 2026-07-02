import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PlatformRole,
  ProjectRole,
  UserStatus,
  DeploymentStatus,
  JobType,
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
