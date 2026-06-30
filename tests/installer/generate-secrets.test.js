import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = new URL('../../scripts/generate-secrets.js', import.meta.url).pathname;

describe('generate-secrets — output format', () => {
  it('prints three secret key=value pairs to stdout', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 0, `Script exited ${r.status}: ${r.stderr}`);
    const lines = r.stdout.split('\n').filter((l) => /^[A-Z_]+=/.test(l));
    assert.equal(lines.length, 3, `Expected 3 key=value lines, got ${lines.length}`);
  });

  it('SESSION_SECRET is 128 hex chars (64 bytes)', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    const match = r.stdout.match(/^SESSION_SECRET=([0-9a-f]+)$/m);
    assert.ok(match, 'SESSION_SECRET line missing');
    assert.equal(match[1].length, 128, `Expected 128 hex chars, got ${match[1].length}`);
  });

  it('HELLODEPLOY_MASTER_KEY is valid base64 of 32 bytes', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    const match = r.stdout.match(/^HELLODEPLOY_MASTER_KEY=(.+)$/m);
    assert.ok(match, 'HELLODEPLOY_MASTER_KEY line missing');
    const raw = Buffer.from(match[1], 'base64');
    assert.equal(raw.length, 32, `Expected 32 bytes, got ${raw.length}`);
  });

  it('GITHUB_WEBHOOK_SECRET is 64 hex chars (32 bytes)', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    const match = r.stdout.match(/^GITHUB_WEBHOOK_SECRET=([0-9a-f]+)$/m);
    assert.ok(match, 'GITHUB_WEBHOOK_SECRET line missing');
    assert.equal(match[1].length, 64, `Expected 64 hex chars, got ${match[1].length}`);
  });

  it('generates unique values on each run', () => {
    const r1 = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    const r2 = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    const key1 = r1.stdout.match(/^HELLODEPLOY_MASTER_KEY=(.+)$/m)?.[1];
    const key2 = r2.stdout.match(/^HELLODEPLOY_MASTER_KEY=(.+)$/m)?.[1];
    assert.ok(key1 && key2, 'HELLODEPLOY_MASTER_KEY missing from one or both runs');
    assert.notEqual(key1, key2, 'Two runs produced the same master key — RNG broken');
  });
});

describe('generate-secrets — write mode', () => {
  it('writes secrets to the specified env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hd-test-'));
    const envPath = join(dir, '.env');
    const r = spawnSync(process.execPath, [SCRIPT, '--write', '--output', envPath], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, `Script failed: ${r.stderr}`);
    const content = readFileSync(envPath, 'utf8');
    assert.ok(content.includes('SESSION_SECRET='), 'SESSION_SECRET not written');
    assert.ok(content.includes('HELLODEPLOY_MASTER_KEY='), 'HELLODEPLOY_MASTER_KEY not written');
    assert.ok(content.includes('GITHUB_WEBHOOK_SECRET='), 'GITHUB_WEBHOOK_SECRET not written');
  });

  it('does not overwrite keys already present in the env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hd-test-'));
    const envPath = join(dir, '.env');
    const originalKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
    writeFileSync(envPath, `HELLODEPLOY_MASTER_KEY=${originalKey}\n`, 'utf8');

    spawnSync(process.execPath, [SCRIPT, '--write', '--output', envPath], { encoding: 'utf8' });

    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/^HELLODEPLOY_MASTER_KEY=(.+)$/m);
    assert.ok(match, 'HELLODEPLOY_MASTER_KEY missing after write');
    assert.equal(match[1], originalKey, 'Existing HELLODEPLOY_MASTER_KEY was overwritten');
  });
});
