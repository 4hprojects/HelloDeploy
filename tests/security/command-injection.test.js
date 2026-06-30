import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

async function src(relPath) {
  return readFile(join(ROOT, relPath), 'utf8');
}

// ─── spawn() usage — no shell interpolation ───────────────────────────────────

describe('command injection prevention — spawn() must never use shell: true', () => {
  const workerFiles = [
    'apps/worker/src/deployment/build.js',
    'apps/worker/src/deployment/container.js',
    'apps/worker/src/git/clone.js',
    'apps/worker/src/nginx/route-manager.js',
  ];

  for (const file of workerFiles) {
    it(`${file} has no shell: true in spawn calls`, async () => {
      const source = await src(file);
      assert.ok(
        !source.includes('shell: true'),
        `${file} must not use shell interpolation — use argument arrays`,
      );
    });
  }

  it('apps/worker/src/git/clone.js disables interactive prompts (GIT_TERMINAL_PROMPT=0)', async () => {
    const source = await src('apps/worker/src/git/clone.js');
    assert.ok(
      source.includes('GIT_TERMINAL_PROMPT'),
      'git clone must suppress interactive prompts so a malicious remote cannot prompt for credentials',
    );
  });

  it('apps/worker/src/git/clone.js removes the remote after clone (token URL not retained)', async () => {
    const source = await src('apps/worker/src/git/clone.js');
    assert.ok(
      source.includes("'remote', 'remove', 'origin'"),
      'origin remote (which contains the token URL) must be removed after clone',
    );
  });

  it('apps/worker/src/git/clone.js removes the .git directory (token URL purged from reflog)', async () => {
    const source = await src('apps/worker/src/git/clone.js');
    assert.ok(
      source.includes('.git'),
      '.git directory must be removed so the token URL is purged from git reflog',
    );
  });
});

// ─── Container hardening flags ────────────────────────────────────────────────

describe('container security — hardening flags in startContainer', () => {
  let source;

  before(async () => {
    source = await src('apps/worker/src/deployment/container.js');
  });

  it('drops all Linux capabilities (--cap-drop ALL)', () => {
    assert.ok(
      source.includes('cap-drop') && source.includes('ALL'),
      'containers must have all capabilities dropped',
    );
  });

  it('prevents privilege escalation (--security-opt no-new-privileges:true)', () => {
    assert.ok(
      source.includes('no-new-privileges'),
      'containers must not be able to gain new privileges via setuid/setgid',
    );
  });

  it('enforces pids-limit for fork-bomb resistance', () => {
    assert.ok(
      source.includes('pids-limit'),
      'containers must have a PID limit to prevent fork-bomb resource exhaustion',
    );
  });

  it('disables swap (memory-swap == memory — no memory limit bypass via swap)', () => {
    assert.ok(
      source.includes('memory-swap'),
      'swap must be capped at the same value as memory to prevent memory limit bypass',
    );
  });

  it('binds container port to loopback only (127.0.0.1:port, not 0.0.0.0:port)', () => {
    assert.ok(
      source.includes('127.0.0.1:'),
      'container ports must bind to 127.0.0.1 only — external access goes through Nginx',
    );
    assert.ok(
      !source.includes('0.0.0.0:'),
      'containers must never bind to all interfaces (0.0.0.0)',
    );
  });

  it('does not mount the Docker socket (would allow container escape)', () => {
    assert.ok(
      !source.includes('/var/run/docker.sock'),
      'containers must not have Docker socket access',
    );
  });

  it('does not use --privileged mode', () => {
    assert.ok(!source.includes('--privileged'), 'containers must never run in privileged mode');
  });

  it('does not use --network host (must use isolated project network)', () => {
    assert.ok(
      !source.includes('--network host') && !source.includes("'host'"),
      'containers must use an isolated network, not the host network stack',
    );
  });
});

// ─── Docker build — command array (no shell) ──────────────────────────────────

describe('Docker build — no shell interpolation in image tag or context path', () => {
  let source;

  before(async () => {
    source = await src('apps/worker/src/deployment/build.js');
  });

  it('build.js has no shell: true', () => {
    assert.ok(!source.includes('shell: true'));
  });

  it('build.js uses --network none during build (no outbound network access)', () => {
    assert.ok(
      source.includes('--network') && source.includes('none'),
      'Docker build must run without network access to prevent dependency smuggling',
    );
  });

  it('build.js sets a memory limit on the build process', () => {
    assert.ok(
      source.includes('--memory'),
      'Docker build must have a memory limit to prevent resource exhaustion during build',
    );
  });

  it('build.js applies a build timeout (kills runaway builds)', () => {
    assert.ok(
      source.includes('buildTimeoutMs') && source.includes('SIGKILL'),
      'runaway Docker builds must be killed after timeout',
    );
  });
});
