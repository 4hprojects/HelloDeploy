import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUILDER_LIMITS, BuilderState, PlatformRole } from '@hellodeploy/contracts';

const { createBuilderController } =
  await import('../../apps/worker/src/builder/builder-controller.js');

const SUPER_ADMIN_ID = 'a'.repeat(24);
const ADMIN_ID = 'b'.repeat(24);
const DEMOTED_ID = 'c'.repeat(24);
const BUILD_TIMEOUT_MS = 15 * 60_000;

function healthyResources() {
  return {
    memAvailableMb: 4000,
    swapTotalMb: 4096,
    swapFreeMb: 2048,
    memoryPressureSome60: 0,
    memoryPressureFull10: 0,
    appMemoryPressureFull10: 0,
    builderMemoryPressureFull10: 0,
    diskFreeGb: 500,
    storeFreeGb: 25,
    builderMemoryMb: 80,
  };
}

/**
 * A controller over fake systemd, BuildKit, registry, clock and timers. The
 * fake unit keeps its own state, so tests read what happened to the service.
 */
function createHarness() {
  const harness = {
    clock: Date.parse('2026-10-23T00:00:00Z'),
    resources: healthyResources(),
    isBuilderBroken: false,
    isRegistryDown: false,
    roles: {
      [SUPER_ADMIN_ID]: PlatformRole.SUPER_ADMIN,
      [ADMIN_ID]: PlatformRole.ADMIN,
      [DEMOTED_ID]: PlatformRole.USER,
    },
    audits: [],
    published: [],
    timers: new Set(),
  };
  const unit = {
    unit: 'hellodeploy-buildkitd.service',
    state: 'inactive',
    async start() {
      unit.state = 'active';
    },
    async stop() {
      unit.state = 'inactive';
    },
    async kill() {
      if (unit.state !== 'active') {
        throw new Error('Failed to kill unit: not running');
      }
      unit.state = 'failed';
    },
    async isActive() {
      return unit.state;
    },
  };
  harness.unit = unit;
  harness.controller = createBuilderController({
    unitControl: unit,
    verifyBuilder: async () => {
      if (unit.state !== 'active' || harness.isBuilderBroken) {
        throw new Error('Builder hellodeploy-builder uses the docker-container driver');
      }
    },
    verifyRegistry: async () => {
      if (harness.isRegistryDown) {
        throw new Error(harness.registryError ?? 'Registry is unavailable: connection refused');
      }
    },
    readResources: async () => harness.resources,
    readSettings: async () => ({ idleMinutes: 30 }),
    publishStatus: async (status) => harness.published.push(status),
    writeAudit: async (event) => harness.audits.push(event),
    loadActorRole: async (id) => harness.roles[id] ?? null,
    logger: { warn() {}, info() {}, error() {} },
    now: () => harness.clock,
    sleep: async (ms) => {
      harness.clock += ms;
    },
    setRepeating: (fn) => (harness.timers.add(fn), fn),
    clearRepeating: (fn) => harness.timers.delete(fn),
    startTimeoutMs: 10_000,
  });
  harness.request = (action, actorId = SUPER_ADMIN_ID) =>
    harness.controller.handleControlJob({ action, actorId });
  harness.startReady = async () => {
    await harness.request('start');
    await harness.controller.whenStartSettles();
  };
  harness.acquire = () =>
    harness.controller.acquireBuild({
      deploymentId: 'd'.repeat(24),
      projectId: 'e'.repeat(24),
      timeoutMs: BUILD_TIMEOUT_MS,
    });
  harness.runMonitor = async () => {
    for (const fn of harness.timers) {
      fn();
    }
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  harness.state = () => harness.controller.getSnapshot().state;
  return harness;
}

describe('builder controller — starting', () => {
  it('becomes ready once the isolated builder answers', async () => {
    const harness = createHarness();
    await harness.startReady();
    assert.equal(harness.state(), BuilderState.READY);
  });

  it('stays stopped when the host lacks memory headroom', async () => {
    const harness = createHarness();
    harness.resources = { ...healthyResources(), memAvailableMb: 1215, swapFreeMb: 0 };
    await harness.startReady();
    assert.equal(harness.state(), BuilderState.STOPPED);
  });

  it('never starts the service when the host lacks memory headroom', async () => {
    const harness = createHarness();
    harness.resources = { ...healthyResources(), memAvailableMb: 1215 };
    await harness.startReady();
    assert.equal(harness.unit.state, 'inactive');
  });

  it('fails the start when the builder never proves it is the isolated one', async () => {
    const harness = createHarness();
    harness.isBuilderBroken = true;
    await harness.startReady();
    assert.equal(harness.state(), BuilderState.FAILED);
  });

  it('stops the service again after a failed start', async () => {
    const harness = createHarness();
    harness.isBuilderBroken = true;
    await harness.startReady();
    assert.equal(harness.unit.state, 'inactive');
  });

  it('checks the registry as soon as it is ready', async () => {
    const harness = createHarness();
    harness.isRegistryDown = true;
    await harness.startReady();
    assert.equal(harness.controller.getSnapshot().registry.ok, false);
  });
});

describe('builder controller — authorization', () => {
  it('refuses Start from an ordinary administrator', async () => {
    const harness = createHarness();
    await harness.request('start', ADMIN_ID);
    assert.equal(harness.unit.state, 'inactive');
  });

  it('records a refused request as denied', async () => {
    const harness = createHarness();
    await harness.request('emergency-stop', ADMIN_ID);
    assert.deepEqual(
      harness.audits.map(({ action, outcome }) => ({ action, outcome })),
      [{ action: 'builder.control_refused', outcome: 'DENIED' }],
    );
  });

  it('refuses a queued Start from a user whose super administrator role was removed', async () => {
    const harness = createHarness();
    await harness.request('start', DEMOTED_ID);
    assert.equal(harness.unit.state, 'inactive');
  });

  it('lets an ordinary administrator check the registry', async () => {
    const harness = createHarness();
    const result = await harness.request('check-registry', ADMIN_ID);
    assert.equal(result.ok, true);
  });

  it('rejects a job that names no administrator', async () => {
    const harness = createHarness();
    await assert.rejects(
      harness.controller.handleControlJob({ action: 'start' }),
      /must name the administrator/,
    );
  });
});

describe('builder controller — builds', () => {
  it('refuses a build while the builder is stopped', async () => {
    const harness = createHarness();
    await assert.rejects(harness.acquire(), { code: 'BUILDER_OFFLINE' });
  });

  it('refuses a build when the host lacks headroom', async () => {
    const harness = createHarness();
    await harness.startReady();
    harness.resources = { ...healthyResources(), diskFreeGb: 5 };
    await assert.rejects(harness.acquire(), { code: 'BUILDER_INSUFFICIENT_RESOURCES' });
  });

  it('refuses a build when the builder no longer proves it is isolated', async () => {
    const harness = createHarness();
    await harness.startReady();
    harness.isBuilderBroken = true;
    await assert.rejects(harness.acquire(), { code: 'BUILDER_OFFLINE' });
  });

  it('allows one build at a time', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.acquire();
    await assert.rejects(harness.acquire(), { code: 'BUILDER_OFFLINE' });
  });

  it('returns to ready when the build finishes', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    await lease.release();
    assert.equal(harness.state(), BuilderState.READY);
  });
});

describe('builder controller — stopping', () => {
  it('stops an idle builder on request', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.request('stop');
    assert.equal(harness.unit.state, 'inactive');
  });

  it('refuses a normal Stop while a build is running', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.acquire();
    const result = await harness.request('stop');
    assert.equal(result.ok, false);
  });

  it('leaves the running build alone when Stop is refused', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    await harness.request('stop');
    assert.equal(lease.signal.aborted, false);
  });

  it('cancels the running build on Emergency Stop', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    await harness.request('emergency-stop');
    assert.equal(lease.signal.reason.code, 'BUILD_CANCELLED');
  });

  it('kills the service on Emergency Stop', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.acquire();
    await harness.request('emergency-stop');
    assert.notEqual(harness.unit.state, 'active');
  });

  it('reports stopped after an Emergency Stop of an idle builder', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.request('emergency-stop');
    assert.equal(harness.state(), BuilderState.STOPPED);
  });

  it('handles Emergency Stop while the deployment job is still waiting on its build', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    // The deployment job: blocked until its build ends, as a real build would be.
    const deploymentJob = new Promise((resolve) => {
      lease.signal.addEventListener('abort', () => resolve('build cancelled'));
    });
    await harness.request('emergency-stop');
    assert.equal(await deploymentJob, 'build cancelled');
  });

  it('cancels a pending start when Emergency Stop arrives first', async () => {
    const harness = createHarness();
    harness.isBuilderBroken = true;
    await harness.request('start');
    await harness.request('emergency-stop');
    harness.isBuilderBroken = false;
    await harness.controller.whenStartSettles();
    assert.equal(harness.state(), BuilderState.STOPPED);
  });
});

describe('builder controller — monitoring during a build', () => {
  it('cancels the build when available memory falls too low', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    harness.resources = { ...healthyResources(), memAvailableMb: 400 };
    await harness.runMonitor();
    assert.match(lease.signal.reason.message, /protect running apps/);
  });

  it('keeps building when only the rest of the host is under memory pressure', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    harness.resources = { ...healthyResources(), memoryPressureFull10: 7.64 };
    await harness.runMonitor();
    assert.equal(lease.signal.aborted, false);
  });

  it('cancels the build when the running apps stall on memory', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    harness.resources = { ...healthyResources(), appMemoryPressureFull10: 12 };
    await harness.runMonitor();
    assert.match(lease.signal.reason.message, /Running apps reached 12% memory pressure/);
  });

  it('cancels the build when the service dies', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    harness.unit.state = 'failed';
    await harness.runMonitor();
    assert.equal(lease.signal.aborted, true);
  });

  it('marks the builder failed when the service dies during a build', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.acquire();
    harness.unit.state = 'failed';
    await harness.runMonitor();
    assert.equal(harness.state(), BuilderState.FAILED);
  });

  it('kills the service when a build outlives its timeout and grace period', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.acquire();
    harness.clock += BUILD_TIMEOUT_MS + BUILDER_LIMITS.watchdogGraceMs + 1;
    await harness.runMonitor();
    assert.equal(harness.unit.state, 'failed');
  });

  it('cancels the build when resources cannot be read', async () => {
    const harness = createHarness();
    await harness.startReady();
    const lease = await harness.acquire();
    harness.resources = null;
    await harness.runMonitor();
    assert.equal(lease.signal.aborted, true);
  });
});

describe('builder controller — idle shutdown and restarts', () => {
  it('stops the builder after the idle period', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.controller.tick();
    harness.clock += 30 * 60_000;
    await harness.controller.tick();
    assert.equal(harness.unit.state, 'inactive');
  });

  it('keeps the builder running before the idle period ends', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.controller.tick();
    harness.clock += 29 * 60_000;
    await harness.controller.tick();
    assert.equal(harness.state(), BuilderState.READY);
  });

  it('never stops a running build through idle shutdown', async () => {
    const harness = createHarness();
    await harness.startReady();
    await harness.controller.tick();
    await harness.acquire();
    harness.clock += 120 * 60_000;
    await harness.controller.tick();
    assert.equal(harness.state(), BuilderState.BUILDING);
  });

  it('adopts a service that is still running after a worker restart', async () => {
    const harness = createHarness();
    harness.unit.state = 'active';
    await harness.controller.reconcile();
    assert.equal(harness.state(), BuilderState.READY);
  });

  it('records a stopped service after a worker restart', async () => {
    const harness = createHarness();
    await harness.controller.reconcile();
    assert.equal(harness.state(), BuilderState.STOPPED);
  });

  it('marks the builder failed when the service stops on its own', async () => {
    const harness = createHarness();
    await harness.startReady();
    harness.unit.state = 'failed';
    await harness.controller.tick();
    assert.equal(harness.state(), BuilderState.FAILED);
  });

  it('keeps credentials out of the registry error it publishes', async () => {
    const harness = createHarness();
    const token = ['ghp', 'A'.repeat(36)].join('_');
    harness.isRegistryDown = true;
    harness.registryError = `denied: token ${token} rejected`;
    await harness.startReady();
    assert.doesNotMatch(harness.published.at(-1).registry.error, new RegExp(token));
  });

  it('publishes a status the web can read', async () => {
    const harness = createHarness();
    await harness.startReady();
    assert.equal(harness.published.at(-1).state, BuilderState.READY);
  });
});
