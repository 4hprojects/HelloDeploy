import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('../../scripts/preflight.js', import.meta.url).pathname;

describe('preflight — JSON output', () => {
  it('outputs valid JSON with --json flag', () => {
    // We ignore exit code here — checks may fail in CI where Docker/Nginx are absent.
    const r = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8', timeout: 15000 });
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(r.stdout);
    }, 'stdout must be valid JSON');
    assert.ok(typeof parsed.passed === 'number', 'JSON must have a "passed" count');
    assert.ok(typeof parsed.failed === 'number', 'JSON must have a "failed" count');
    assert.ok(Array.isArray(parsed.checks), 'JSON must have a "checks" array');
  });

  it('each check has label, ok, detail fields', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8', timeout: 15000 });
    const { checks } = JSON.parse(r.stdout);
    assert.ok(checks.length > 0, 'checks array must not be empty');
    for (const check of checks) {
      assert.ok('label' in check, `check missing label: ${JSON.stringify(check)}`);
      assert.ok('ok' in check, `check missing ok: ${JSON.stringify(check)}`);
      assert.ok('detail' in check, `check missing detail: ${JSON.stringify(check)}`);
      assert.equal(
        typeof check.ok,
        'boolean',
        `check.ok must be boolean: ${JSON.stringify(check)}`,
      );
    }
  });

  it('Node.js version check passes (we are running a compatible version)', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8', timeout: 15000 });
    const { checks } = JSON.parse(r.stdout);
    const nodeCheck = checks.find((c) => c.label.includes('Node.js'));
    assert.ok(nodeCheck, 'Node.js check not found');
    assert.ok(nodeCheck.ok, `Node.js check failed: ${nodeCheck.detail}`);
  });

  it('npm check passes', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8', timeout: 15000 });
    const { checks } = JSON.parse(r.stdout);
    const npmCheck = checks.find((c) => c.label.includes('npm'));
    assert.ok(npmCheck, 'npm check not found');
    assert.ok(npmCheck.ok, `npm check failed: ${npmCheck.detail}`);
  });

  it('passed + failed equals total checks', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8', timeout: 15000 });
    const { passed, failed, checks } = JSON.parse(r.stdout);
    assert.equal(passed + failed, checks.length, 'passed + failed must equal total checks');
  });

  it('supports managed TLS Redis without introducing a separate host mode', () => {
    const sentinel = 'managed-redis-password-must-not-appear';
    const r = spawnSync(process.execPath, [SCRIPT, '--json'], {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        REDIS_URL: `rediss://user:${sentinel}@managed.example.test:6380/0`,
      },
    });
    const output = JSON.parse(r.stdout);
    assert.equal('mode' in output, false);
    const redisCheck = output.checks.find((check) => check.label.includes('Managed TLS Redis'));
    assert.deepEqual(redisCheck, {
      label: 'Managed TLS Redis URL configured',
      ok: true,
      detail: 'managed TLS Redis configured',
    });
    assert.doesNotMatch(r.stdout, new RegExp(sentinel));
    assert.doesNotMatch(r.stderr, new RegExp(sentinel));
  });

  it('rejects removed host-mode arguments', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--mode', 'hybrid_worker', '--json'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Unknown preflight argument/);
    assert.doesNotMatch(r.stdout, /Hybrid Render|hybrid_worker/);
  });
});
