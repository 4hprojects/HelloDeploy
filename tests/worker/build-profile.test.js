import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import {
  BuildProfileError,
  resolveBuildProfile,
} from '../../apps/worker/src/deployment/build-profile.js';

async function makeProject({ packageJson, packageLock = true, nextConfig, files = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'hellodeploy-profile-'));
  if (packageJson) {
    await writeFile(join(dir, 'package.json'), JSON.stringify(packageJson));
  }
  if (packageLock) {
    await writeFile(join(dir, 'package-lock.json'), '{}');
  }
  if (nextConfig) {
    await writeFile(join(dir, 'next.config.js'), nextConfig);
  }
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  return dir;
}

async function withProject(options, fn) {
  const dir = await makeProject(options);
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('optimized-v1 build profile selection', () => {
  it('preserves legacy without inspecting project manifests', async () => {
    const result = await resolveBuildProfile({
      contextDir: '/path/that/does/not/exist',
      runtimeType: 'NODEJS',
      requestedTemplateVersion: 'legacy',
    });
    assert.deepEqual(result, { templateVersion: 'legacy', fallbackReason: null });
  });

  it('allows static projects without package manifests', async () => {
    const result = await resolveBuildProfile({
      contextDir: '/path/that/does/not/exist',
      runtimeType: 'STATIC',
      requestedTemplateVersion: 'optimized-v1',
    });
    assert.deepEqual(result, { templateVersion: 'optimized-v1', fallbackReason: null });
  });

  it('uses dependency-first Node only without root lifecycle or build scripts', async () => {
    await withProject(
      { packageJson: { scripts: { start: 'node server.js' } } },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NODEJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.deepEqual(result, { templateVersion: 'optimized-v1', fallbackReason: null });
      },
    );
  });

  it('falls back for source-dependent lifecycle scripts', async () => {
    for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
      await withProject(
        { packageJson: { scripts: { start: 'node server.js', [script]: 'node setup.js' } } },
        async (contextDir) => {
          const result = await resolveBuildProfile({
            contextDir,
            runtimeType: 'EXPRESS',
            requestedTemplateVersion: 'optimized-v1',
          });
          assert.equal(result.templateVersion, 'legacy', script);
          assert.match(result.fallbackReason, new RegExp(script), script);
        },
      );
    }
  });

  it('falls back for Node build scripts and missing npm lockfiles', async () => {
    await withProject(
      { packageJson: { scripts: { start: 'node dist.js', build: 'tsc' } } },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NODEJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.templateVersion, 'legacy');
        assert.match(result.fallbackReason, /build script/);
      },
    );
    await withProject(
      { packageJson: { scripts: { start: 'node server.js' } }, packageLock: false },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NODEJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.templateVersion, 'legacy');
        assert.match(result.fallbackReason, /package-lock/);
      },
    );
  });

  it('requires statically confirmed standalone output for optimized Next.js', async () => {
    const packageJson = { scripts: { build: 'next build', start: 'next start' } };
    await withProject(
      { packageJson, nextConfig: "export default { output: 'standalone' };" },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NEXTJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.templateVersion, 'optimized-v1');
      },
    );
    await withProject({ packageJson }, async (contextDir) => {
      await assert.rejects(
        resolveBuildProfile({
          contextDir,
          runtimeType: 'NEXTJS',
          requestedTemplateVersion: 'optimized-v1',
        }),
        /requires Next\.js standalone output to be statically confirmed/,
      );
    });
  });

  it('falls back for npm workspaces', async () => {
    await withProject(
      { packageJson: { scripts: { start: 'node server.js' }, workspaces: ['packages/*'] } },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NODEJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.deepEqual(result, {
          templateVersion: 'legacy',
          fallbackReason: 'npm workspaces require legacy ordering',
        });
      },
    );
  });

  it('falls back for file: dependencies', async () => {
    await withProject(
      {
        packageJson: {
          scripts: { start: 'node server.js' },
          dependencies: { shared: 'file:./shared' },
        },
      },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'EXPRESS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.fallbackReason, 'file: or link: dependencies require legacy ordering');
      },
    );
  });

  it('falls back for link: devDependencies', async () => {
    await withProject(
      {
        packageJson: {
          scripts: { start: 'node server.js' },
          devDependencies: { tooling: 'link:../tooling' },
        },
      },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NODEJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.fallbackReason, 'file: or link: dependencies require legacy ordering');
      },
    );
  });

  it('falls back for a committed .npmrc', async () => {
    await withProject(
      {
        packageJson: { scripts: { start: 'node server.js' } },
        files: { '.npmrc': '@acme:registry=https://npm.example.test/\n' },
      },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NODEJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.fallbackReason, 'a committed .npmrc requires legacy ordering');
      },
    );
  });

  it('keeps registry dependencies on optimized-v1', async () => {
    await withProject(
      {
        packageJson: {
          scripts: { start: 'node server.js' },
          dependencies: { express: '^4.21.0' },
        },
      },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'EXPRESS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.templateVersion, 'optimized-v1');
      },
    );
  });

  it('confirms standalone output declared in next.config.cjs', async () => {
    await withProject(
      {
        packageJson: { scripts: { build: 'next build' } },
        files: { 'next.config.cjs': "module.exports = { output: 'standalone' };" },
      },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NEXTJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.templateVersion, 'optimized-v1');
      },
    );
  });

  it('confirms standalone output declared in next.config.mts', async () => {
    await withProject(
      {
        packageJson: { scripts: { build: 'next build' } },
        files: { 'next.config.mts': 'export default { output: "standalone" };' },
      },
      async (contextDir) => {
        const result = await resolveBuildProfile({
          contextDir,
          runtimeType: 'NEXTJS',
          requestedTemplateVersion: 'optimized-v1',
        });
        assert.equal(result.templateVersion, 'optimized-v1');
      },
    );
  });

  it('raises a typed build-context error when standalone output is unconfirmed', async () => {
    await withProject({ packageJson: { scripts: { build: 'next build' } } }, async (contextDir) => {
      await assert.rejects(
        resolveBuildProfile({
          contextDir,
          runtimeType: 'NEXTJS',
          requestedTemplateVersion: 'optimized-v1',
        }),
        (err) => err instanceof BuildProfileError && err.code === 'BUILD_CONTEXT_INVALID',
      );
    });
  });
});
