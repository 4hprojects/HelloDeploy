import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { MonitoringIncident, MonitoringSample } from '@hellodeploy/database';
import { normalizeMonitoringPolicy } from '@hellodeploy/contracts';

import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';
import {
  bucketStart,
  createHistoryWriter,
  summarize,
} from '../../apps/worker/src/monitoring/history.js';
import { createAlertEngine, observe } from '../../apps/worker/src/monitoring/alert-engine.js';

const policy = normalizeMonitoringPolicy(null);
const T0 = Date.parse('2026-11-05T10:00:00Z');

function snapshot({
  cpu = 20,
  memory = 50,
  load1 = 0.5,
  pressure = 0,
  disk = 40,
  apps = [],
  sources,
} = {}) {
  return {
    intervals: { resourceSeconds: 15, serviceSeconds: 30 },
    metrics: [
      { key: 'host.cpu.utilization', value: cpu },
      { key: 'host.cpu.cores', value: 4 },
      { key: 'host.load.1m', value: load1 },
      { key: 'host.memory.usedPercent', value: memory },
      { key: 'host.memory.pressureSome60', value: pressure },
    ],
    disks: [{ key: 'root', label: 'Root filesystem', usedPercent: disk }],
    apps,
    sources: sources ?? { host: { ok: true }, docker: { ok: true } },
    services: [],
  };
}

describe('history aggregation', () => {
  it('weights averages by how many samples each point covers', () => {
    const bucket = summarize([
      { count: 1, cpu: { avg: 10, max: 10 } },
      { count: 3, cpu: { avg: 50, max: 90 } },
    ]);
    assert.deepEqual(bucket.cpu, { avg: 40, max: 90 });
  });

  it('leaves a field absent rather than averaging missing readings in as zero', () => {
    const bucket = summarize([
      { cpu: null, mem: 40 },
      { cpu: null, mem: 60 },
    ]);
    assert.deepEqual([bucket.cpu, bucket.mem.avg], [undefined, 50]);
  });

  it('aligns buckets to UTC boundaries', () => {
    assert.equal(
      bucketStart('2026-11-05T10:07:44Z', '5m').toISOString(),
      '2026-11-05T10:05:00.000Z',
    );
  });
});

describe('history writer', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  const sample = (offsetSeconds, cpu) => ({
    t: new Date(T0 + offsetSeconds * 1000).toISOString(),
    cpu,
    mem: 50,
  });

  async function feed(writer, seconds, every = 15) {
    for (let s = 0; s <= seconds; s += every) {
      await writer.record(sample(s, 20 + (s % 60)), policy);
    }
  }

  it('writes one 1-minute bucket per minute, not one document per sample', async () => {
    const writer = createHistoryWriter({ now: () => new Date(T0) });
    await feed(writer, 600);
    assert.equal(await MonitoringSample.countDocuments({ resolution: '1m' }), 10);
  });

  it('rolls minutes up into a 5-minute bucket when it closes', async () => {
    const writer = createHistoryWriter({ now: () => new Date(T0) });
    await feed(writer, 600);
    const fiveMinute = await MonitoringSample.findOne({
      resolution: '5m',
      bucketStart: new Date(T0),
    }).lean();
    assert.equal(fiveMinute.count, 20);
  });

  it('sets each bucket to expire after its tier retention', async () => {
    const writer = createHistoryWriter({ now: () => new Date(T0) });
    await feed(writer, 75);
    const minute = await MonitoringSample.findOne({ resolution: '1m' }).lean();
    assert.equal(minute.expiresAt.getTime() - minute.bucketStart.getTime(), 24 * 3_600_000);
  });

  it('removes only history older than a shortened retention', async () => {
    await MonitoringSample.create([
      {
        resolution: '1m',
        bucketStart: new Date(T0 - 5 * 3_600_000),
        count: 4,
        expiresAt: new Date(T0 + 1e9),
      },
      {
        resolution: '1m',
        bucketStart: new Date(T0 - 30 * 60_000),
        count: 4,
        expiresAt: new Date(T0 + 1e9),
      },
    ]);
    const shorter = normalizeMonitoringPolicy({ revision: 3, retention: { minuteHours: 2 } });
    const writer = createHistoryWriter({ now: () => new Date(T0) });
    await writer.record(sample(0, 10), shorter);
    assert.equal(await MonitoringSample.countDocuments({ resolution: '1m' }), 1);
  });
});

describe('alert rules', () => {
  it('keeps CPU at warning without saturation evidence', () => {
    const cpu = observe(snapshot({ cpu: 97, load1: 1 }), policy).find((o) => o.rule === 'host.cpu');
    assert.equal(cpu.level, 'warning');
  });

  it('raises CPU to critical when work queues for it', () => {
    const cpu = observe(snapshot({ cpu: 97, load1: 6 }), policy).find((o) => o.rule === 'host.cpu');
    assert.equal(cpu.level, 'critical');
  });

  it('keeps memory at warning without pressure evidence', () => {
    const memory = observe(snapshot({ memory: 95, pressure: 0.5 }), policy).find(
      (o) => o.rule === 'host.memory',
    );
    assert.equal(memory.level, 'warning');
  });

  it('treats a missing reading as unknown, neither breach nor recovery', () => {
    const cpu = observe(snapshot({ cpu: null }), policy).find((o) => o.rule === 'host.cpu');
    assert.equal(cpu.unknown, true);
  });
});

describe('incident lifecycle', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  function engineAt(clock) {
    return createAlertEngine({ now: () => new Date(clock.now) });
  }

  async function run(engine, clock, snap, seconds, step = 15) {
    for (let s = 0; s < seconds; s += step) {
      await engine.evaluate(snap, policy);
      clock.now += step * 1000;
    }
  }

  it('does not open an incident for one high CPU sample', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await engine.evaluate(snapshot({ cpu: 92 }), policy);
    assert.equal(await MonitoringIncident.countDocuments(), 0);
  });

  it('opens one incident once the breach outlasts the sustain duration', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    assert.equal(await MonitoringIncident.countDocuments({ rule: 'host.cpu', state: 'active' }), 1);
  });

  it('keeps one incident however long the breach lasts', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 1200);
    assert.equal(await MonitoringIncident.countDocuments({ rule: 'host.cpu' }), 1);
  });

  it('does not resolve while the value sits between recovery and warning', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    await run(engine, clock, snapshot({ cpu: 75 }), 300);
    assert.equal(await MonitoringIncident.countDocuments({ state: 'active' }), 1);
  });

  it('resolves once the value stays below the recovery level', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    await run(engine, clock, snapshot({ cpu: 40 }), 90);
    const incident = await MonitoringIncident.findOne({ rule: 'host.cpu' }).lean();
    assert.deepEqual([incident.state, incident.resolution], ['resolved', 'recovered']);
  });

  it('reopens the same incident when the condition returns soon after', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    await run(engine, clock, snapshot({ cpu: 40 }), 90);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    const incidents = await MonitoringIncident.find({ rule: 'host.cpu' }).lean();
    assert.deepEqual(
      [incidents.length, incidents[0].occurrences, incidents[0].state],
      [1, 2, 'active'],
    );
  });

  it('holds an open incident while readings are missing', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    await run(engine, clock, snapshot({ cpu: null }), 300);
    assert.equal(await MonitoringIncident.countDocuments({ state: 'active' }), 1);
  });

  it('writes lastSeen at most once a minute while a breach holds', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    const before = (await MonitoringIncident.findOne().lean()).updatedAt;
    await run(engine, clock, snapshot({ cpu: 92 }), 30);
    assert.deepEqual((await MonitoringIncident.findOne().lean()).updatedAt, before);
  });

  it('closes an outage as cleared when the project is stopped on purpose', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    const app = { projectId: 'p1', slug: 'one', reason: 'x' };
    await engine.evaluate(snapshot({ apps: [{ ...app, health: 'unhealthy' }] }), policy);
    await engine.evaluate(snapshot({ apps: [{ ...app, health: 'stopped' }] }), policy);
    const incident = await MonitoringIncident.findOne({ rule: 'app.health' }).lean();
    assert.equal(incident.resolution, 'cleared');
  });

  it('opens a deployment incident on failure and resolves it on the next successful deploy', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    const base = { projectId: 'p1', slug: 'one', deploymentId: 'd1', sequenceNumber: 4 };
    await engine.recordDeployment({ ...base, status: 'FAILED' }, policy);
    await engine.recordDeployment({ ...base, deploymentId: 'd2', status: 'HEALTHY' }, policy);
    const incident = await MonitoringIncident.findOne({ rule: 'deployment.failed' }).lean();
    assert.equal(incident.state, 'resolved');
  });

  it('counts repeated failed deploys as occurrences of one incident', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    const base = { projectId: 'p1', slug: 'one', sequenceNumber: 4, status: 'FAILED' };
    await engine.recordDeployment({ ...base, deploymentId: 'd1' }, policy);
    await engine.recordDeployment({ ...base, deploymentId: 'd2' }, policy);
    const incidents = await MonitoringIncident.find({ rule: 'deployment.failed' }).lean();
    assert.deepEqual([incidents.length, incidents[0].occurrences], [1, 2]);
  });

  it('picks up incidents left open by a previous worker process', async () => {
    const clock = { now: T0 };
    await run(engineAt(clock), clock, snapshot({ cpu: 92 }), 330);
    const restarted = engineAt(clock);
    await run(restarted, clock, snapshot({ cpu: 40 }), 90);
    assert.equal((await MonitoringIncident.findOne().lean()).state, 'resolved');
  });

  it('reactivates an acknowledged warning that turns critical', async () => {
    const clock = { now: T0 };
    const engine = engineAt(clock);
    await run(engine, clock, snapshot({ cpu: 92 }), 330);
    await MonitoringIncident.updateOne({}, { state: 'acknowledged', acknowledgedAt: new Date() });
    const restarted = engineAt(clock);
    await run(restarted, clock, snapshot({ cpu: 99, load1: 8 }), 330);
    const incident = await MonitoringIncident.findOne().lean();
    assert.deepEqual([incident.severity, incident.state], ['critical', 'active']);
  });
});
