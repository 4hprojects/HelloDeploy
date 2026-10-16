import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { describe, it } from 'node:test';
import {
  assertProtectedConfigMode,
  assertAcceptanceEnvironment,
  assertPrivateCanary,
  checkRoute,
  evaluateDockerInspect,
  measureStreaming,
  parseAcceptanceArguments,
  pollUntil,
  renderEvidenceMarkdown,
  sanitizeEvidence,
  validateAcceptanceConfig,
  validateFixtureManifest,
} from '../../scripts/lib/multi-runtime-acceptance.js';
import { findTests } from '../../scripts/run-tests.js';

const sha = (character) => character.repeat(40);
const manifest = validateFixtureManifest({
  schemaVersion: 1,
  fixtures: [
    {
      id: 'static',
      applicationRoot: 'tests/fixtures/multi-runtime/static',
      runtimeType: 'STATIC',
      buildStrategy: 'legacy_generated',
      probePath: '/',
    },
  ],
});

function config(overrides = {}) {
  return {
    schemaVersion: 1,
    environmentClass: 'nonproduction',
    confirmationId: 'acceptance-lab-01',
    platformBaseUrl: 'https://platform.acceptance.invalid',
    fixtureRepository: 'example/hellodeploy',
    baselineSha: sha('a'),
    candidateSha: sha('b'),
    builderName: 'acceptance-builder',
    ghcrRepository: 'ghcr.io/example/hellodeploy-acceptance',
    privateCanary: 'private-canary-value-1234',
    controlPlaneTargets: [{ name: 'database', url: 'https://database.internal.invalid' }],
    projects: [
      {
        fixtureId: 'static',
        projectId: '0123456789abcdef01234567',
        deployHookUrl:
          'https://platform.acceptance.invalid/api/deploy-hooks/0123456789abcdef01234567/token-value',
        routeUrl: 'https://fixture.acceptance.invalid',
        expectedStrategy: 'legacy_generated',
        expectedApplicationRoot: 'tests/fixtures/multi-runtime/static',
      },
    ],
    ...overrides,
  };
}

describe('multi-runtime acceptance CLI gates', () => {
  it('defaults to preflight-only and requires absolute protected paths', () => {
    assert.deepEqual(parseAcceptanceArguments(['--config', '/secure/acceptance.json']), {
      configPath: '/secure/acceptance.json',
      execute: false,
      withCancellation: false,
      withTimeout: false,
      withWorkerInterruption: false,
      withResourcePressure: false,
      withRegistryCleanup: false,
    });
    assert.throws(() => parseAcceptanceArguments(['--config', 'relative.json']), /absolute path/);
  });

  it('requires evidence and exact confirmation before execution', () => {
    assert.throws(
      () => parseAcceptanceArguments(['--config', '/secure/config.json', '--execute']),
      /evidence-output/,
    );
    const options = parseAcceptanceArguments([
      '--config',
      '/secure/config.json',
      '--execute',
      '--confirm-environment',
      'acceptance-lab-01',
      '--evidence-output',
      '/secure/evidence',
    ]);
    assert.equal(options.execute, true);
    assert.throws(
      () =>
        validateAcceptanceConfig(config(), manifest, {
          execute: true,
          confirmEnvironment: 'different-lab',
        }),
      /does not match/,
    );
  });

  it('gates every disruptive suite behind execute', () => {
    for (const flag of [
      '--with-cancellation',
      '--with-timeout',
      '--with-worker-interruption',
      '--with-resource-pressure',
      '--with-registry-cleanup',
    ]) {
      assert.throws(
        () => parseAcceptanceArguments(['--config', '/secure/config.json', flag]),
        /require --execute/,
      );
    }
  });

  it('rejects production, unsafe hooks, incomplete SHAs, and project mismatches', () => {
    assert.throws(
      () => validateAcceptanceConfig(config(), manifest, { nodeEnv: 'production' }),
      /refuses NODE_ENV=production/,
    );
    assert.throws(
      () => validateAcceptanceConfig(config({ baselineSha: 'abc' }), manifest),
      /full lowercase/,
    );
    const unsafe = config();
    unsafe.projects[0].deployHookUrl = 'http://platform.invalid/hook/token';
    assert.throws(() => validateAcceptanceConfig(unsafe, manifest), /HTTPS URL/);
    const mismatch = config();
    mismatch.projects[0].expectedApplicationRoot = '.';
    assert.throws(() => validateAcceptanceConfig(mismatch, manifest), /do not match/);
  });

  it('rejects world-readable configuration modes', () => {
    assert.doesNotThrow(() => assertProtectedConfigMode({ mode: 0o100600, isFile: () => true }));
    assert.throws(
      () => assertProtectedConfigMode({ mode: 0o100644, isFile: () => true }),
      /group or others/,
    );
  });

  it('requires an exact nonproduction database identity', () => {
    const marker = {
      schemaVersion: 1,
      environmentClass: 'nonproduction',
      environmentId: 'acceptance-lab-01',
    };
    assert.equal(assertAcceptanceEnvironment(marker, 'acceptance-lab-01'), marker);
    for (const invalid of [
      undefined,
      'production',
      { ...marker, schemaVersion: 2 },
      { ...marker, environmentId: 'different-lab-01' },
    ]) {
      assert.throws(() => assertAcceptanceEnvironment(invalid, 'acceptance-lab-01'));
    }
  });

  it('requires the decrypted private canary to match without exposing it', () => {
    const record = {
      projectId: '0123456789abcdef01234567',
      name: 'ACCEPTANCE_PRIVATE_CANARY',
      ciphertext: 'opaque',
      iv: 'opaque',
      authTag: 'opaque',
      encryptionVersion: 1,
      aadBound: true,
    };
    assert.equal(
      assertPrivateCanary(record, 'expected-value-1234', () => 'expected-value-1234'),
      true,
    );
    assert.throws(
      () => assertPrivateCanary(record, 'expected-value-1234', () => 'different-value-123'),
      /missing or does not match/,
    );
    assert.throws(
      () =>
        assertPrivateCanary(record, 'expected-value-1234', () => {
          throw new Error('ciphertext details');
        }),
      /missing or does not match/,
    );
  });

  it('fails the fixture build if the runtime-only canary is present', () => {
    const probe = new URL(
      '../fixtures/multi-runtime/private-secret-probe/check-build-env.js',
      import.meta.url,
    ).pathname;
    const environmentWithoutCanary = { ...process.env };
    delete environmentWithoutCanary.ACCEPTANCE_PRIVATE_CANARY;
    const absent = spawnSync(process.execPath, [probe], {
      encoding: 'utf8',
      env: environmentWithoutCanary,
    });
    assert.equal(absent.status, 0);
    assert.equal(absent.stdout, 'private-build-secret-absent\n');

    const present = spawnSync(process.execPath, [probe], {
      encoding: 'utf8',
      env: { ...process.env, ACCEPTANCE_PRIVATE_CANARY: 'must-not-appear' },
    });
    assert.equal(present.status, 1);
    assert.doesNotMatch(`${present.stdout}${present.stderr}`, /must-not-appear/);
  });
});

describe('multi-runtime acceptance injected boundaries', () => {
  it('keeps fixture dependency and build outputs out of normal test discovery', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hellodeploy-test-discovery-'));
    try {
      await Promise.all([
        mkdir(path.join(directory, 'node_modules', 'dependency'), { recursive: true }),
        mkdir(path.join(directory, '.next', 'server'), { recursive: true }),
        mkdir(path.join(directory, 'suite'), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(path.join(directory, 'node_modules', 'dependency', 'foreign.test.js'), ''),
        writeFile(path.join(directory, '.next', 'server', 'compiled.test.js'), ''),
        writeFile(path.join(directory, 'suite', 'owned.test.js'), ''),
      ]);
      assert.deepEqual(findTests(directory), [path.join(directory, 'suite', 'owned.test.js')]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('polls to success and enforces a bounded timeout', async () => {
    let reads = 0;
    const result = await pollUntil(
      async () => {
        reads += 1;
        return reads;
      },
      (value) => value === 3,
      { timeoutMs: 10, intervalMs: 0, sleep: async () => {}, now: () => 0 },
    );
    assert.equal(result, 3);

    let time = 0;
    await assert.rejects(
      pollUntil(async () => false, Boolean, {
        timeoutMs: 2,
        intervalMs: 1,
        now: () => time,
        sleep: async () => {
          time += 1;
        },
      }),
      /Timed out/,
    );
  });

  it('checks routes without retaining response bodies', async () => {
    const result = await checkRoute('https://fixture.invalid/acceptance', {
      marker: 'fixture-ok',
      fetchImpl: async () => new Response('fixture-ok', { status: 200 }),
    });
    assert.deepEqual(result, { ok: true, status: 200, markerFound: true });
  });

  it('proves the first streamed chunk arrives before completion', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('first'));
          controller.enqueue(new TextEncoder().encode('last'));
          controller.close();
        },
      }),
    );
    const times = [0, 10, 100];
    const result = await measureStreaming('https://fixture.invalid/stream', {
      fetchImpl: async () => response,
      now: () => times.shift(),
    });
    assert.deepEqual(result, { firstChunkMs: 10, totalMs: 100, deliveredEarly: true });
  });

  it('evaluates required runtime isolation properties', () => {
    const result = evaluateDockerInspect(
      {
        Config: { User: 'node' },
        HostConfig: {
          PortBindings: { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '49152' }] },
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          NetworkMode: 'hellodeploy-project',
          PidsLimit: 128,
          NanoCpus: 500000000,
          Memory: 268435456,
          ReadonlyRootfs: true,
        },
        Mounts: [],
      },
      { requireReadOnly: true },
    );
    assert.ok(Object.values(result).every(Boolean));
  });

  it('removes sensitive keys and values from JSON and Markdown evidence', () => {
    const secret = 'private-canary-value-1234';
    const clean = sanitizeEvidence(
      {
        result: 'pass',
        deployHookUrl: 'https://example.invalid/token',
        fixtures: [{ fixtureId: 'static', result: 'pass', note: secret }],
      },
      [secret],
    );
    const serialized = JSON.stringify(clean);
    assert.doesNotMatch(serialized, /deployHookUrl|private-canary/);
    assert.match(serialized, /REDACTED/);
    const markdown = renderEvidenceMarkdown({
      ...clean,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:01:00.000Z',
    });
    assert.doesNotMatch(markdown, /private-canary|token/);
  });
});
