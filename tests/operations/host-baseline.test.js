import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const SCRIPT = new URL('../../scripts/capture-host-baseline.js', import.meta.url).pathname;
const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);

function capture(args = ['--json']) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      SESSION_SECRET: 'baseline-session-sentinel',
      HELLODEPLOY_MASTER_KEY: 'baseline-master-key-sentinel',
      REDIS_URL: 'rediss://user:baseline-redis-sentinel@example.test:6380',
    },
  });
}

describe('sanitized host baseline', () => {
  it('is exposed through the documented npm command', () => {
    assert.equal(packageJson.scripts['host:baseline'], 'node scripts/capture-host-baseline.js');
  });

  it('emits a bounded machine-readable inventory even when blockers exist', () => {
    const result = capture();
    assert.ok([0, 1].includes(result.status), result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.ok(['supported', 'candidate', 'unsupported'].includes(output.platform.tier));
    assert.equal(typeof output.release.clean, 'boolean');
    assert.equal(typeof output.prerequisites.dockerCli, 'boolean');
    assert.equal(typeof output.services.web, 'boolean');
    assert.equal(typeof output.routing.wildcardTunnelRoute, 'boolean');
    assert.equal(typeof output.health.livenessHttpStatus, 'number');
    assert.ok(Array.isArray(output.blockers));
  });

  it('never reflects environment values, endpoints, hostnames, or process details', () => {
    const result = capture();
    for (const forbidden of [
      'baseline-session-sentinel',
      'baseline-master-key-sentinel',
      'baseline-redis-sentinel',
      'rediss://',
      'process.env',
      'cmdline',
    ]) {
      assert.doesNotMatch(result.stdout, new RegExp(forbidden));
      assert.doesNotMatch(result.stderr, new RegExp(forbidden));
    }
  });

  it('rejects invalid and unknown arguments without running the inventory', () => {
    const invalidPort = capture(['--web-port', 'not-a-port', '--json']);
    assert.equal(invalidPort.status, 2);
    assert.match(invalidPort.stderr, /integer from 1 to 65535/);

    const unknown = capture(['--unknown']);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Unknown or incomplete baseline argument/);
  });
});
