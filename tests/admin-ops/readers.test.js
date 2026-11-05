import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { after, before, beforeEach, describe, it } from 'node:test';

import { MonitoringIncident, MonitoringSample } from '@hellodeploy/database';

import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';
import { runDockerRead } from '../../apps/worker/src/monitoring/docker.js';
import { readUnits } from '../../apps/worker/src/monitoring/systemd.js';

const { getHistory } = await import('../../apps/web/src/services/admin-ops/history.service.js');
const { listRecentlyResolved } =
  await import('../../apps/web/src/services/admin-ops/incidents.service.js');

/** A child process stand-in that emits `output` and then exits with `code`. */
function fakeSpawn({ output = '', code = 0, hang = false, calls = [] } = {}) {
  return (command, args) => {
    calls.push([command, ...args]);
    const proc = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.killed = false;
    proc.kill = () => {
      proc.killed = true;
    };
    if (!hang) {
      setImmediate(() => {
        proc.stdout.write(output);
        proc.stdout.end();
        proc.emit('close', code);
      });
    }
    return proc;
  };
}

describe('bounded docker reads', () => {
  it('returns stdout of a successful read', async () => {
    assert.equal(await runDockerRead(['ps'], { spawnFn: fakeSpawn({ output: 'abc\n' }) }), 'abc\n');
  });

  it('rejects a non-zero exit', async () => {
    await assert.rejects(runDockerRead(['ps'], { spawnFn: fakeSpawn({ code: 1 }) }), /exited 1/);
  });

  it('kills and rejects a read that hangs past its timeout', async () => {
    await assert.rejects(
      runDockerRead(['stats'], { timeoutMs: 20, spawnFn: fakeSpawn({ hang: true }) }),
      /timed out/,
    );
  });

  it('rejects output larger than the cap instead of buffering it', async () => {
    const huge = 'x'.repeat(5 * 1024 * 1024);
    await assert.rejects(
      runDockerRead(['inspect'], { spawnFn: fakeSpawn({ output: huge }) }),
      /exceeded the cap/,
    );
  });

  it('never passes the command through a shell', async () => {
    const calls = [];
    await runDockerRead(['ps', '-a'], { spawnFn: fakeSpawn({ calls }) });
    assert.deepEqual(calls[0], ['docker', 'ps', '-a']);
  });
});

describe('systemd unit reads', () => {
  it('asks systemctl only to show properties of the named units', async () => {
    const calls = [];
    await readUnits([{ unit: 'redis-server.service' }], {
      spawnFn: fakeSpawn({ calls, output: 'Id=redis-server.service\nLoadState=loaded\n' }),
    });
    assert.deepEqual(calls[0].slice(0, 2), ['systemctl', 'show']);
  });

  it('rejects when systemctl fails', async () => {
    await assert.rejects(readUnits([{ unit: 'x.service' }], { spawnFn: fakeSpawn({ code: 1 }) }));
  });
});

describe('recorded history and resolved incidents', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  const now = new Date('2026-11-05T12:00:00Z');

  it('reads the 5-minute tier for a 24-hour range, oldest first', async () => {
    await MonitoringSample.create([
      {
        resolution: '5m',
        bucketStart: new Date('2026-11-05T11:00:00Z'),
        count: 20,
        cpu: { avg: 40, max: 60 },
        expiresAt: now,
      },
      {
        resolution: '5m',
        bucketStart: new Date('2026-11-05T10:00:00Z'),
        count: 20,
        cpu: { avg: 30, max: 50 },
        expiresAt: now,
      },
      {
        resolution: '1h',
        bucketStart: new Date('2026-11-05T10:00:00Z'),
        count: 240,
        cpu: { avg: 35, max: 60 },
        expiresAt: now,
      },
    ]);
    const history = await getHistory('24h', { now });
    assert.deepEqual(
      history.points.map((p) => p.cpu),
      [30, 40],
    );
  });

  it('keeps a missing field as null in history points', async () => {
    await MonitoringSample.create({
      resolution: '5m',
      bucketStart: new Date('2026-11-05T11:00:00Z'),
      count: 3,
      expiresAt: now,
    });
    const history = await getHistory('6h', { now });
    assert.equal(history.points[0].cpu, null);
  });

  it('has no recorded history for the raw ranges', async () => {
    assert.equal(await getHistory('15m', { now }), null);
  });

  it('lists only incidents resolved within the window', async () => {
    const base = {
      rule: 'host.cpu',
      scope: 'host',
      severity: 'warning',
      state: 'resolved',
      title: 't',
      firstSeen: now,
      lastSeen: now,
    };
    await MonitoringIncident.create([
      { ...base, fingerprint: 'a', resolvedAt: new Date('2026-11-05T11:00:00Z') },
      { ...base, fingerprint: 'b', resolvedAt: new Date('2026-11-03T11:00:00Z') },
    ]);
    const resolved = await listRecentlyResolved({ now });
    assert.deepEqual(
      resolved.map((r) => r.fingerprint),
      ['a'],
    );
  });
});
