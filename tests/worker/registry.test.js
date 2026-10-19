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

  it('deletes only a digest-pinned GHCR manifest', async () => {
    const imageRef = `ghcr.io/example/hellodeploy-apps:release-1@sha256:${'a'.repeat(64)}`;
    const commands = [];
    await deleteRegistryManifest(imageRef, {
      isDeletionEnabled: true,
      run: async (args) => (commands.push(args), { code: 0, stderr: '' }),
    });
    assert.deepEqual(commands, [['manifest', 'delete', '--force', imageRef]]);
    await assert.rejects(
      deleteRegistryManifest('ghcr.io/example/hellodeploy-apps:latest'),
      /digest-pinned/,
    );
  });

  it('leaves manifests in place when registry deletion is disabled', async () => {
    const commands = [];
    const result = await deleteRegistryManifest(
      `ghcr.io/example/hellodeploy-apps:release-1@sha256:${'a'.repeat(64)}`,
      {
        isDeletionEnabled: false,
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
        run: async () => ({ code: 1, stderr: 'Error: MANIFEST_UNKNOWN: manifest unknown' }),
      },
    );
    assert.equal(result, true);
  });
});

/** ORAS that serves an index listing the image and its attestation. */
function orasWithIndex({ isGone = false } = {}) {
  return async () =>
    isGone
      ? { code: 1, stdout: '', stderr: 'Error: MANIFEST_UNKNOWN: manifest unknown' }
      : {
          code: 0,
          stdout: JSON.stringify({
            manifests: [{ digest: IMAGE }, { digest: ATTESTATION }],
          }),
          stderr: '',
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
    deleteApi: 'github-packages',
    packagesOwnerType: 'org',
    packagesTokenPath,
    run: orasWithIndex(),
    ...overrides,
  });

  it('deletes the child manifests before the index', async () => {
    const { fetchImpl, requests } = fakePackagesApi();
    await deleteRegistryManifest(IMAGE_REF, packagesDeps({ fetchImpl }));
    assert.deepEqual(
      requests.filter((request) => request.startsWith('DELETE')),
      [`DELETE ${VERSIONS_URL}/2`, `DELETE ${VERSIONS_URL}/3`, `DELETE ${VERSIONS_URL}/1`],
    );
  });

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
});
