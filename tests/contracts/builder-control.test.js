import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUILDER_LIMITS,
  BUILDER_STATUS_STALE_MS,
  DEFAULT_BUILDER_IDLE_MINUTES,
  PlatformRole,
  evaluateBuilderAdmission,
  evaluateBuilderEligibility,
  evaluateBuilderPressure,
  getBuilderRuntimeFamily,
  isBuilderStatusFresh,
  isIsolatedBuilderEndpoint,
  normalizeBuilderSettings,
} from '@hellodeploy/contracts';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const NEEDED_MB = BUILDER_LIMITS.memoryMaxMb + BUILDER_LIMITS.hostReserveMb;

function allowNext(projectIds = [PROJECT_ID]) {
  return normalizeBuilderSettings({ runtimes: { next: { enabled: true, projectIds } } });
}

function healthySample(overrides = {}) {
  return {
    memAvailableMb: NEEDED_MB,
    swapTotalMb: 4096,
    swapFreeMb: BUILDER_LIMITS.minSwapFreeMb,
    memoryPressureSome60: 0,
    memoryPressureFull10: 0,
    appMemoryPressureFull10: 0,
    builderMemoryPressureFull10: 0,
    diskFreeGb: BUILDER_LIMITS.minDiskFreeGb,
    storeFreeGb: BUILDER_LIMITS.minStoreFreeGb,
    ...overrides,
  };
}

describe('builder eligibility', () => {
  it('leaves legacy Node builds alone', () => {
    assert.equal(
      evaluateBuilderEligibility({
        strategy: 'legacy_generated',
        projectId: PROJECT_ID,
        ownerRole: PlatformRole.USER,
        settings: normalizeBuilderSettings(null),
      }),
      null,
    );
  });

  it('refuses owner Dockerfiles while builder control is on', () => {
    assert.equal(
      evaluateBuilderEligibility({
        strategy: 'dockerfile_v1',
        projectId: PROJECT_ID,
        ownerRole: PlatformRole.SUPER_ADMIN,
        settings: allowNext(),
      }).code,
      'BUILD_STRATEGY_DISABLED',
    );
  });

  it('refuses prebuilt images while builder control is on', () => {
    assert.equal(
      evaluateBuilderEligibility({
        strategy: 'oci_image_v1',
        projectId: PROJECT_ID,
        ownerRole: PlatformRole.SUPER_ADMIN,
        settings: allowNext(),
      }).code,
      'BUILD_STRATEGY_DISABLED',
    );
  });

  it('refuses a project owned by an ordinary user', () => {
    assert.equal(
      evaluateBuilderEligibility({
        strategy: 'next_standalone_v1',
        projectId: PROJECT_ID,
        ownerRole: PlatformRole.USER,
        settings: allowNext(),
      }).code,
      'BUILDER_PROJECT_NOT_ALLOWED',
    );
  });

  it('refuses a runtime the database permissions leave off', () => {
    assert.equal(
      evaluateBuilderEligibility({
        strategy: 'python_flask_v1',
        projectId: PROJECT_ID,
        ownerRole: PlatformRole.ADMIN,
        settings: allowNext(),
      }).code,
      'BUILDER_PROJECT_NOT_ALLOWED',
    );
  });

  it('refuses a project missing from the database allowlist', () => {
    assert.equal(
      evaluateBuilderEligibility({
        strategy: 'next_standalone_v1',
        projectId: PROJECT_ID,
        ownerRole: PlatformRole.ADMIN,
        settings: allowNext(['507f1f77bcf86cd799439012']),
      }).code,
      'BUILDER_PROJECT_NOT_ALLOWED',
    );
  });

  it('allows an administrator-owned, allowlisted project', () => {
    assert.equal(
      evaluateBuilderEligibility({
        strategy: 'next_standalone_v1',
        projectId: PROJECT_ID.toUpperCase(),
        ownerRole: PlatformRole.ADMIN,
        settings: allowNext(),
      }),
      null,
    );
  });

  it('maps Java strategies to the java family', () => {
    assert.equal(getBuilderRuntimeFamily('java_gradle_v1'), 'java');
  });
});

describe('builder admission', () => {
  it('admits a host exactly at every threshold', () => {
    assert.deepEqual(evaluateBuilderAdmission(healthySample()), []);
  });

  it('refuses when available memory is one megabyte short', () => {
    assert.equal(
      evaluateBuilderAdmission(healthySample({ memAvailableMb: NEEDED_MB - 1 })).length,
      1,
    );
  });

  it('refuses when free swap is below the minimum', () => {
    assert.equal(evaluateBuilderAdmission(healthySample({ swapFreeMb: 0 })).length, 1);
  });

  it('ignores swap on a host without swap', () => {
    assert.deepEqual(
      evaluateBuilderAdmission(healthySample({ swapTotalMb: 0, swapFreeMb: 0 })),
      [],
    );
  });

  it('refuses under memory pressure at the limit', () => {
    assert.equal(
      evaluateBuilderAdmission(
        healthySample({ memoryPressureSome60: BUILDER_LIMITS.maxMemoryPressureSome60 }),
      ).length,
      1,
    );
  });

  it('refuses when free disk is below the minimum', () => {
    assert.equal(evaluateBuilderAdmission(healthySample({ diskFreeGb: 19 })).length, 1);
  });

  it('refuses when the build cache storage cannot be read', () => {
    assert.equal(evaluateBuilderAdmission(healthySample({ storeFreeGb: null })).length, 1);
  });

  it('refuses when a reading is missing', () => {
    assert.equal(evaluateBuilderAdmission(healthySample({ memAvailableMb: NaN })).length, 1);
  });

  it('refuses today’s measured production host (1,215 MB available, swap full)', () => {
    assert.equal(
      evaluateBuilderAdmission(healthySample({ memAvailableMb: 1215, swapFreeMb: 0 })).length,
      2,
    );
  });
});

describe('builder pressure during a build', () => {
  it('keeps a build running at the abort thresholds', () => {
    assert.deepEqual(
      evaluateBuilderPressure(
        healthySample({
          memAvailableMb: BUILDER_LIMITS.abortAvailableMb,
          appMemoryPressureFull10: BUILDER_LIMITS.abortAppMemoryPressureFull10,
          builderMemoryPressureFull10: BUILDER_LIMITS.abortBuilderMemoryPressureFull10,
          diskFreeGb: BUILDER_LIMITS.abortDiskFreeGb,
        }),
      ),
      [],
    );
  });

  it('cancels when available memory falls below the abort threshold', () => {
    assert.equal(
      evaluateBuilderPressure(
        healthySample({ memAvailableMb: BUILDER_LIMITS.abortAvailableMb - 1 }),
      ).length,
      1,
    );
  });

  // Measured 2026-10-25: a busy desktop drove system-wide pressure to 7.6% while
  // the apps and the builder stalled 0%; that build must not be cancelled.
  it('keeps a build running when only the rest of the host is under pressure', () => {
    assert.deepEqual(evaluateBuilderPressure(healthySample({ memoryPressureFull10: 7.64 })), []);
  });

  it('cancels when the running apps stall on memory', () => {
    assert.equal(
      evaluateBuilderPressure(healthySample({ appMemoryPressureFull10: 5.01 })).length,
      1,
    );
  });

  it('cancels when the builder is thrashing', () => {
    assert.equal(
      evaluateBuilderPressure(healthySample({ builderMemoryPressureFull10: 66 })).length,
      1,
    );
  });

  it('cancels when the app pressure reading is missing', () => {
    assert.equal(
      evaluateBuilderPressure(healthySample({ appMemoryPressureFull10: NaN })).length,
      1,
    );
  });

  it('cancels when free disk falls below the abort threshold', () => {
    assert.equal(evaluateBuilderPressure(healthySample({ diskFreeGb: 9 })).length, 1);
  });
});

describe('isolated builder endpoints', () => {
  it('accepts the builder’s own Unix socket', () => {
    assert.equal(isIsolatedBuilderEndpoint('unix:///run/hellodeploy-builder/buildkitd.sock'), true);
  });

  it('accepts a TCP address', () => {
    assert.equal(isIsolatedBuilderEndpoint('tcp://builder.internal:1234'), true);
  });

  it('rejects the production Docker daemon socket', () => {
    assert.equal(isIsolatedBuilderEndpoint('unix:///var/run/docker.sock'), false);
  });

  it('rejects any Docker socket path', () => {
    assert.equal(isIsolatedBuilderEndpoint('unix:///home/builder/.docker/run/docker.sock'), false);
  });

  it('rejects a Docker-hosted builder container address', () => {
    assert.equal(isIsolatedBuilderEndpoint('docker-container://buildx_buildkit_x'), false);
  });

  it('rejects a missing address', () => {
    assert.equal(isIsolatedBuilderEndpoint(null), false);
  });
});

describe('builder settings and status', () => {
  it('closes every runtime when nothing is stored', () => {
    assert.deepEqual(normalizeBuilderSettings(undefined).runtimes.next, {
      enabled: false,
      projectIds: [],
    });
  });

  it('falls back to the default idle shutdown for an out-of-range value', () => {
    assert.equal(
      normalizeBuilderSettings({ idleMinutes: 1 }).idleMinutes,
      DEFAULT_BUILDER_IDLE_MINUTES,
    );
  });

  it('treats a status older than the stale limit as unknown', () => {
    const now = Date.parse('2026-10-23T00:00:00Z');
    assert.equal(
      isBuilderStatusFresh(
        { updatedAt: new Date(now - BUILDER_STATUS_STALE_MS - 1).toISOString() },
        now,
      ),
      false,
    );
  });

  it('treats a missing status as unknown', () => {
    assert.equal(isBuilderStatusFresh(null), false);
  });
});
