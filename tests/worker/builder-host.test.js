import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus, evaluateBuilderAdmission } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { parseMeminfo, parseMemoryPressure, readHostResources } =
  await import('../../apps/worker/src/builder/host-resources.js');
const { createUnitControl } = await import('../../apps/worker/src/builder/unit-control.js');
const { failInterruptedBuilderDeployments } =
  await import('../../apps/worker/src/builder/interrupted-builds.js');

const MEMINFO = [
  'MemTotal:        7511040 kB',
  'MemFree:          176128 kB',
  'MemAvailable:    1244160 kB',
  'SwapTotal:       4193280 kB',
  'SwapFree:           3072 kB',
].join('\n');
const PRESSURE = [
  'some avg10=0.09 avg60=0.12 avg300=0.11 total=167515993',
  'full avg10=0.04 avg60=0.08 avg300=0.08 total=119798258',
].join('\n');
const PATHS = {
  workspacePath: '/var/lib/hellodeploy/builds',
  storePath: '/var/lib/hellodeploy-builder',
  unit: 'hellodeploy-buildkitd.service',
};

function fakeFs({ files = {}, freeGb = {}, slice = null } = {}) {
  return {
    readdir: async () => {
      if (!slice) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return slice;
    },
    readFile: async (path) => {
      if (!(path in files)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return files[path];
    },
    statfs: async (path) => {
      if (!(path in freeGb)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return { bavail: freeGb[path] * 1024 * 1024, bsize: 1024 };
    },
  };
}

describe('host resource readings', () => {
  it('reads available memory and swap from /proc/meminfo', () => {
    assert.deepEqual(parseMeminfo(MEMINFO), {
      memAvailableMb: 1215,
      swapTotalMb: 4095,
      swapFreeMb: 3,
    });
  });

  it('reads the memory pressure averages', () => {
    assert.deepEqual(parseMemoryPressure(PRESSURE), { some60: 0.12, full10: 0.04 });
  });

  it('reports free disk for the build workspace', async () => {
    const sample = await readHostResources(
      PATHS,
      fakeFs({
        files: { '/proc/meminfo': MEMINFO, '/proc/pressure/memory': PRESSURE },
        freeGb: { [PATHS.workspacePath]: 801, [PATHS.storePath]: 28 },
      }),
    );
    assert.equal(sample.diskFreeGb, 801);
  });

  const SCOPE_A = `docker-${'a'.repeat(64)}.scope`;
  const SCOPE_B = `docker-${'b'.repeat(64)}.scope`;
  const pressureText = (full10) =>
    `some avg10=0.00 avg60=0.00 avg300=0.00 total=0\nfull avg10=${full10} avg60=0.00 avg300=0.00 total=0\n`;

  it('reads the highest memory pressure among the app containers', async () => {
    const sample = await readHostResources(
      PATHS,
      fakeFs({
        files: {
          '/proc/meminfo': MEMINFO,
          '/proc/pressure/memory': PRESSURE,
          [`/sys/fs/cgroup/system.slice/${SCOPE_A}/memory.pressure`]: pressureText('0.50'),
          [`/sys/fs/cgroup/system.slice/${SCOPE_B}/memory.pressure`]: pressureText('3.20'),
        },
        freeGb: { [PATHS.workspacePath]: 801, [PATHS.storePath]: 28 },
        slice: [SCOPE_A, SCOPE_B, 'cron.service'],
      }),
    );
    assert.equal(sample.appMemoryPressureFull10, 3.2);
  });

  it('falls back to system-wide pressure when no container can be read', async () => {
    const sample = await readHostResources(
      PATHS,
      fakeFs({
        files: { '/proc/meminfo': MEMINFO, '/proc/pressure/memory': PRESSURE },
        freeGb: { [PATHS.workspacePath]: 801, [PATHS.storePath]: 28 },
      }),
    );
    assert.equal(sample.appMemoryPressureFull10, 0.04);
  });

  it('reads the builder unit’s own memory pressure', async () => {
    const sample = await readHostResources(
      PATHS,
      fakeFs({
        files: {
          '/proc/meminfo': MEMINFO,
          '/proc/pressure/memory': PRESSURE,
          [`/sys/fs/cgroup/system.slice/${PATHS.unit}/memory.pressure`]: pressureText('66.00'),
        },
        freeGb: { [PATHS.workspacePath]: 801, [PATHS.storePath]: 28 },
      }),
    );
    assert.equal(sample.builderMemoryPressureFull10, 66);
  });

  it('refuses admission when memory readings are unavailable', async () => {
    const sample = await readHostResources(
      PATHS,
      fakeFs({ freeGb: { [PATHS.workspacePath]: 801, [PATHS.storePath]: 28 } }),
    );
    assert.ok(evaluateBuilderAdmission(sample).length > 0);
  });

  it('reports a missing build cache store as unreadable', async () => {
    const sample = await readHostResources(
      PATHS,
      fakeFs({
        files: { '/proc/meminfo': MEMINFO, '/proc/pressure/memory': PRESSURE },
        freeGb: { [PATHS.workspacePath]: 801 },
      }),
    );
    assert.equal(sample.storeFreeGb, null);
  });
});

describe('builder systemd unit control', () => {
  it('manages only the configured unit, without an interactive password prompt', async () => {
    const commands = [];
    const control = createUnitControl({
      unit: PATHS.unit,
      run: async (args) => (commands.push(args), { code: 0, stdout: '', stderr: '' }),
    });
    await control.start();
    await control.stop();
    await control.kill();
    assert.deepEqual(commands, [
      ['--no-ask-password', 'start', '--no-block', PATHS.unit],
      ['--no-ask-password', 'stop', PATHS.unit],
      ['--no-ask-password', 'kill', '--signal=SIGKILL', PATHS.unit],
    ]);
  });

  it('reports a refused systemd request as an error', async () => {
    const control = createUnitControl({
      unit: PATHS.unit,
      run: async () => ({ code: 4, stdout: '', stderr: 'Access denied' }),
    });
    await assert.rejects(
      control.start(),
      /Could not start hellodeploy-buildkitd.service: Access denied/,
    );
  });

  it('reads when the unit became active', async () => {
    const control = createUnitControl({
      unit: PATHS.unit,
      run: async () => ({ code: 0, stdout: '@1792942274\n', stderr: '' }),
    });
    assert.equal((await control.activeSince()).toISOString(), '2026-10-25T15:31:14.000Z');
  });

  it('reports no start time for a unit that is not active', async () => {
    const control = createUnitControl({
      unit: PATHS.unit,
      run: async () => ({ code: 0, stdout: '\n', stderr: '' }),
    });
    assert.equal(await control.activeSince(), null);
  });

  it('reads the unit state', async () => {
    const control = createUnitControl({
      unit: PATHS.unit,
      run: async () => ({ code: 3, stdout: 'inactive\n', stderr: '' }),
    });
    assert.equal(await control.isActive(), 'inactive');
  });
});

describe('builds interrupted by a worker restart', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  async function seedBuilding(buildStrategy) {
    const project = await createProject();
    return createDeployment(project._id, {
      status: DeploymentStatus.BUILDING,
      configurationSnapshot: {
        schemaVersion: 1,
        buildStrategy,
        runtimeType: buildStrategy === 'legacy_generated' ? 'NODEJS' : 'NEXTJS',
        buildConfiguration: { applicationRoot: '.' },
        projectConfigurationVersion: 1,
        environmentVersion: 1,
        sourceCommit: 'a'.repeat(40),
      },
    });
  }

  it('fails a builder deployment left mid-build', async () => {
    const deployment = await seedBuilding('next_standalone_v1');
    await failInterruptedBuilderDeployments();
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'WORKER_INTERRUPTED');
  });

  it('leaves a legacy Node deployment untouched', async () => {
    const deployment = await seedBuilding('legacy_generated');
    await failInterruptedBuilderDeployments();
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.BUILDING);
  });
});
