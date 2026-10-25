import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  deleteRegistryManifest,
  verifyRegistryAccess,
} from '../../apps/worker/src/deployment/registry.js';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createDeployment, createProject } from '../helpers/worker-fixtures.js';

const INDEX = `sha256:${'a'.repeat(64)}`;
const IMAGE = `sha256:${'b'.repeat(64)}`;
const ATTESTATION = `sha256:${'c'.repeat(64)}`;
const IMAGE_REF = `ghcr.io/example/hellodeploy-apps:release-1@${INDEX}`;
const VERSIONS_URL =
  'https://api.github.com/orgs/example/packages/container/hellodeploy-apps/versions';

describe('registry operations', () => {
  it('checks access without putting credentials in argv', async () => {
    const commands = [];
    await verifyRegistryAccess('ghcr.io/example/hellodeploy-apps', {
      run: async (args) => (commands.push(args), { code: 0, stderr: '' }),
    });
    assert.deepEqual(commands, [
      ['repo', 'tags', '--last', '1', 'ghcr.io/example/hellodeploy-apps'],
    ]);
  });

  const platformRepository = 'ghcr.io/example/hellodeploy-apps';
  const digest = `sha256:${'a'.repeat(64)}`;

  // ORAS writes a referrers fallback tag for each attestation when the registry
  // has no Referrers API; it must go with the image, or every build leaks one.
  it('deletes the fallback tags, then the child manifests, then the index', async () => {
    const commands = [];
    await deleteRegistryManifest(IMAGE_REF, {
      isDeletionEnabled: true,
      platformRepository,
      findSharedChildDigests: async () => new Set(),
      run: orasWithIndex({ commands }),
    });
    const repository = 'ghcr.io/example/hellodeploy-apps';
    assert.deepEqual(
      commands.filter((args) => args[1] === 'delete').map((args) => args[3]),
      [
        `${repository}:${IMAGE.replace(':', '-')}`,
        `${repository}:${ATTESTATION.replace(':', '-')}`,
        `${repository}@${IMAGE}`,
        `${repository}@${ATTESTATION}`,
        `${repository}@${INDEX}`,
      ],
    );
  });

  it('refuses to delete an image that is not pinned to a digest', async () => {
    await assert.rejects(
      deleteRegistryManifest(`${platformRepository}:latest`, { platformRepository }),
      /digest-pinned/,
    );
  });

  // An owner-supplied GHCR image must never be deleted with the platform credential.
  it('refuses a digest-pinned manifest outside the platform repository', async () => {
    const commands = [];
    await assert.rejects(
      deleteRegistryManifest(`ghcr.io/owner/their-app@${digest}`, {
        platformRepository,
        run: async (args) => (commands.push(args), { code: 0, stderr: '' }),
      }),
      /platform registry/,
    );
  });

  it('refuses a repository that only shares the platform prefix', async () => {
    await assert.rejects(
      deleteRegistryManifest(`${platformRepository}-evil:release-1@${digest}`, {
        platformRepository,
      }),
      /platform registry/,
    );
  });

  it('refuses every deletion when no platform repository is configured', async () => {
    await assert.rejects(
      deleteRegistryManifest(`${platformRepository}:release-1@${digest}`, {
        platformRepository: '',
      }),
      /platform registry/,
    );
  });

  it('leaves manifests in place when registry deletion is disabled', async () => {
    const commands = [];
    const result = await deleteRegistryManifest(
      `ghcr.io/example/hellodeploy-apps:release-1@sha256:${'a'.repeat(64)}`,
      {
        isDeletionEnabled: false,
        platformRepository,
        run: async (args) => (commands.push(args), { code: 0, stderr: '' }),
      },
    );
    assert.deepEqual([result, commands], [false, []]);
  });

  // A manifest already deleted by another sweep is the outcome cleanup wanted.
  it('treats an already-deleted manifest as deleted', async () => {
    const result = await deleteRegistryManifest(
      `ghcr.io/example/hellodeploy-apps:release-1@sha256:${'a'.repeat(64)}`,
      {
        isDeletionEnabled: true,
        platformRepository,
        run: async () => ({ code: 1, stderr: 'Error: MANIFEST_UNKNOWN: manifest unknown' }),
      },
    );
    assert.equal(result, true);
  });
});

/** ORAS that serves an index listing the image and its attestation. */
function orasWithIndex({ isGone = false, commands = [] } = {}) {
  return async (args) => {
    commands.push(args);
    if (isGone) {
      return { code: 1, stdout: '', stderr: 'Error: MANIFEST_UNKNOWN: manifest unknown' };
    }
    return {
      code: 0,
      stdout: JSON.stringify({ manifests: [{ digest: IMAGE }, { digest: ATTESTATION }] }),
      stderr: '',
    };
  };
}

/** A GitHub Packages API listing the three versions; records each request. */
function fakePackagesApi({ deleteStatus = 204 } = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(`${init.method} ${url}`);
    if (init.method === 'DELETE') {
      return new Response(deleteStatus === 204 ? null : 'Method Not Allowed', {
        status: deleteStatus,
      });
    }
    return new Response(
      JSON.stringify([
        { id: 1, name: INDEX },
        { id: 2, name: IMAGE },
        { id: 3, name: ATTESTATION },
        {
          id: 4,
          name: `sha256:${'e'.repeat(64)}`,
          metadata: { container: { tags: [IMAGE.replace(':', '-')] } },
        },
      ]),
      { status: 200 },
    );
  };
  return { fetchImpl, requests };
}

async function tokenFile() {
  const dir = await mkdtemp(join(tmpdir(), 'hellodeploy-packages-'));
  const path = join(dir, 'token');
  await writeFile(path, 'packages-placeholder\n', { mode: 0o600 });
  return path;
}

// GHCR may refuse the OCI manifest DELETE, so cleanup can delete package
// versions through the GitHub REST API instead.
describe('registry deletion through GitHub Packages', () => {
  let packagesTokenPath;
  before(async () => {
    await startTestDb();
    packagesTokenPath = await tokenFile();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  const packagesDeps = (overrides) => ({
    isDeletionEnabled: true,
    platformRepository: 'ghcr.io/example/hellodeploy-apps',
    deleteApi: 'github-packages',
    packagesOwnerType: 'org',
    packagesTokenPath,
    run: orasWithIndex(),
    ...overrides,
  });

  it('deletes the fallback tag version, then the child manifests, then the index', async () => {
    const { fetchImpl, requests } = fakePackagesApi();
    await deleteRegistryManifest(IMAGE_REF, packagesDeps({ fetchImpl }));
    assert.deepEqual(
      requests.filter((request) => request.startsWith('DELETE')),
      [
        `DELETE ${VERSIONS_URL}/4`,
        `DELETE ${VERSIONS_URL}/2`,
        `DELETE ${VERSIONS_URL}/3`,
        `DELETE ${VERSIONS_URL}/1`,
      ],
    );
  });

  // The fallback index is rewritten by the push that reused the child, so it stays too.
  it('keeps a child manifest that another retained release lists', async () => {
    const project = await createProject();
    await createDeployment(project._id, {
      imageRef: `ghcr.io/example/hellodeploy-apps:release-2@sha256:${'d'.repeat(64)}`,
      imageDigest: `sha256:${'d'.repeat(64)}`,
      imageChildDigests: [IMAGE],
    });
    const { fetchImpl, requests } = fakePackagesApi();
    await deleteRegistryManifest(IMAGE_REF, packagesDeps({ fetchImpl }));
    assert.deepEqual(
      requests.filter((request) => request.startsWith('DELETE')),
      [`DELETE ${VERSIONS_URL}/3`, `DELETE ${VERSIONS_URL}/1`],
    );
  });

  it('treats an index that is already gone as deleted', async () => {
    const { fetchImpl, requests } = fakePackagesApi();
    const result = await deleteRegistryManifest(
      IMAGE_REF,
      packagesDeps({ fetchImpl, run: orasWithIndex({ isGone: true }) }),
    );
    assert.deepEqual([result, requests], [true, []]);
  });

  it('fails when GitHub refuses a version deletion', async () => {
    const { fetchImpl } = fakePackagesApi({ deleteStatus: 403 });
    await assert.rejects(
      deleteRegistryManifest(IMAGE_REF, packagesDeps({ fetchImpl })),
      /version deletion failed: 403/,
    );
  });

  it('probes the Packages API token at startup', async () => {
    await assert.rejects(
      verifyRegistryAccess('ghcr.io/example/hellodeploy-apps', {
        deleteApi: 'github-packages',
        packagesTokenPath,
        run: async () => ({ code: 0, stdout: '', stderr: '' }),
        fetchImpl: async () => new Response('Bad credentials', { status: 401 }),
      }),
      /version listing failed: 401/,
    );
  });

  // GitHub refuses to delete a package's last tagged version (seen live 2026-10-25).
  it('refuses readiness when the package has no permanent anchor version', async () => {
    await assert.rejects(
      verifyRegistryAccess('ghcr.io/example/hellodeploy-apps', {
        deleteApi: 'github-packages',
        packagesTokenPath,
        run: async (args) =>
          args[0] === 'manifest'
            ? { code: 1, stdout: '', stderr: 'not found' }
            : { code: 0, stdout: '', stderr: '' },
        fetchImpl: async () => Response.json([]),
      }),
      /has no hellodeploy-anchor tag/,
    );
  });

  it('is ready when the anchor version exists', async () => {
    assert.deepEqual(
      await verifyRegistryAccess('ghcr.io/example/hellodeploy-apps', {
        deleteApi: 'github-packages',
        packagesTokenPath,
        run: async () => ({ code: 0, stdout: '{}', stderr: '' }),
        fetchImpl: async () => Response.json([]),
      }),
      { ready: true },
    );
  });
});
