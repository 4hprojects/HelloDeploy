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
  getFailureCopy,
  FailureCode,
  RecoveryAction,
  DEPLOYMENT_FAILURE_COPY,
  DeploymentStage,
  DEPLOYMENT_STAGE_ORDER,
  DEPLOYMENT_STAGE_COPY,
  getStageCopy,
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
  it('has all 14 job types', () => {
    const types = Object.values(JobType);
    assert.equal(types.length, 14);
  });

  it('all job types are strings', () => {
    for (const value of Object.values(JobType)) {
      assert.equal(typeof value, 'string');
    }
  });
});

describe('contracts — validateJobPayload', () => {
  it('accepts version-2 custom-domain operation payloads', () => {
    for (const jobType of [JobType.VERIFY_DOMAIN, JobType.ACTIVATE_DOMAIN, JobType.REMOVE_DOMAIN]) {
      assert.doesNotThrow(() =>
        validateJobPayload(jobType, {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
          lifecycleVersion: 2,
          operationId: 'operation-1',
        }),
      );
    }
  });

  it('rejects version-2 custom-domain payloads without attempt fencing', () => {
    assert.throws(
      () =>
        validateJobPayload(JobType.ACTIVATE_DOMAIN, {
          version: 2,
          domainId: 'domain-1',
          projectId: 'project-1',
          hostname: 'app.example.com',
        }),
      JobPayloadValidationError,
    );
  });

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

describe('contracts — getFailureCopy', () => {
  it('returns the plain-language entry for a known failure code', () => {
    const copy = getFailureCopy('BUILD_FAILED');
    assert.equal(copy.message, DEPLOYMENT_FAILURE_COPY.BUILD_FAILED.message);
    assert.ok(copy.action.length > 0);
  });

  it('covers every failure code the deploy pipeline actually stamps', () => {
    const codes = [
      'PORT_ALLOCATION_FAILED',
      'NETWORK_SETUP_FAILED',
      'SECRET_DECRYPTION_FAILED',
      'CONTAINER_START_FAILED',
      'CONTAINER_CRASHED_ON_STARTUP',
      'HEALTH_CHECK_FAILED',
      'SUBDOMAIN_INVALID',
      'NGINX_ROUTE_FAILED',
      'PROJECT_NOT_FOUND',
      'REPO_ACCESS_REVOKED',
      'GITHUB_TOKEN_FAILED',
      'CLONE_FAILED',
      'BUILD_CONTEXT_INVALID',
      'DOCKERFILE_GENERATION_FAILED',
      'BUILD_FAILED',
      'ACTIVATION_ENQUEUE_FAILED',
      'ROLLBACK_SOURCE_INVALID',
      'QUEUE_UNAVAILABLE',
    ];
    const missing = codes.filter((code) => !DEPLOYMENT_FAILURE_COPY[code]);
    assert.deepEqual(missing, []);
  });

  it('falls back to a generic message for an unrecognized code', () => {
    const copy = getFailureCopy('SOME_FUTURE_CODE_NOT_YET_MAPPED');
    assert.equal(copy.message, 'Something went wrong during deployment.');
  });

  it('falls back to a generic message when no code is given', () => {
    const copy = getFailureCopy(undefined);
    assert.equal(copy.message, 'Something went wrong during deployment.');
  });
});

describe('deployment stage copy', () => {
  it('orders every stage in the enum exactly once', () => {
    assert.deepEqual([...DEPLOYMENT_STAGE_ORDER].sort(), Object.values(DeploymentStage).sort());
  });

  it('gives every ordered stage plain-language copy', () => {
    const missing = DEPLOYMENT_STAGE_ORDER.filter((stage) => !DEPLOYMENT_STAGE_COPY[stage]);
    assert.deepEqual(missing, []);
  });

  it('describes what each stage is doing', () => {
    const undescribed = DEPLOYMENT_STAGE_ORDER.filter(
      (stage) => !DEPLOYMENT_STAGE_COPY[stage].description,
    );
    assert.deepEqual(undescribed, []);
  });

  it('avoids infrastructure vocabulary in stage labels', () => {
    const leaked = DEPLOYMENT_STAGE_ORDER.filter((stage) =>
      /nginx|docker|container|port|proxy|pm2/i.test(
        `${DEPLOYMENT_STAGE_COPY[stage].label} ${DEPLOYMENT_STAGE_COPY[stage].description}`,
      ),
    );
    assert.deepEqual(leaked, []);
  });

  it('falls back to generic copy for an unrecognized stage', () => {
    assert.equal(getStageCopy('SOME_FUTURE_STAGE').label, 'Working');
  });
});

describe('failure code coverage', () => {
  it('gives every code in the enum plain-language copy', () => {
    const missing = Object.values(FailureCode).filter((code) => !DEPLOYMENT_FAILURE_COPY[code]);
    assert.deepEqual(missing, []);
  });

  it('has no copy for a code outside the enum', () => {
    const codes = Object.values(FailureCode);
    const orphaned = Object.keys(DEPLOYMENT_FAILURE_COPY).filter((key) => !codes.includes(key));
    assert.deepEqual(orphaned, []);
  });

  it('offers a next action for every code', () => {
    const actionless = Object.values(FailureCode).filter(
      (code) => !DEPLOYMENT_FAILURE_COPY[code].action,
    );
    assert.deepEqual(actionless, []);
  });
});

describe('every failure offers a way forward', () => {
  it('names recovery steps for every code', () => {
    const missing = Object.values(FailureCode).filter(
      (code) => !Array.isArray(DEPLOYMENT_FAILURE_COPY[code].actions),
    );
    assert.deepEqual(missing, []);
  });

  it('uses only known recovery steps', () => {
    const known = new Set(Object.values(RecoveryAction));
    const unknown = Object.values(FailureCode).flatMap((code) =>
      DEPLOYMENT_FAILURE_COPY[code].actions.filter((action) => !known.has(action)),
    );

    assert.deepEqual(unknown, []);
  });

  it('gives an unrecognised code somewhere to go', () => {
    assert.ok(getFailureCopy('SOME_FUTURE_CODE').actions.length > 0);
  });

  it('does not offer a retry for a failure a retry cannot fix', () => {
    // The source release is gone; retrying the rollback would fail the same way.
    assert.ok(
      !DEPLOYMENT_FAILURE_COPY[FailureCode.ROLLBACK_SOURCE_INVALID].actions.includes(
        RecoveryAction.RETRY,
      ),
    );
  });

  it('sends a lost GitHub connection to the repository, not to a retry alone', () => {
    assert.equal(
      DEPLOYMENT_FAILURE_COPY[FailureCode.REPO_ACCESS_REVOKED].actions[0],
      RecoveryAction.REPOSITORY,
    );
  });

  it('sends a missing secret to the settings first', () => {
    assert.equal(
      DEPLOYMENT_FAILURE_COPY[FailureCode.SECRET_DECRYPTION_FAILED].actions[0],
      RecoveryAction.ENVIRONMENT,
    );
  });

  it('sends an unusable address to the address field', () => {
    assert.ok(
      DEPLOYMENT_FAILURE_COPY[FailureCode.SUBDOMAIN_INVALID].actions.includes(
        RecoveryAction.ADDRESS,
      ),
    );
  });
});
