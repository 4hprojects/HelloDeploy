import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deleteRegistryManifest,
  verifyRegistryAccess,
} from '../../apps/worker/src/deployment/registry.js';

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

  it('deletes a digest-pinned manifest in the platform repository', async () => {
    const imageRef = `${platformRepository}:release-1@${digest}`;
    const commands = [];
    await deleteRegistryManifest(imageRef, {
      platformRepository,
      run: async (args) => (commands.push(args), { code: 0, stderr: '' }),
    });
    assert.deepEqual(commands, [['manifest', 'delete', '--force', imageRef]]);
  });

  it('refuses a mutable tag', async () => {
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
});
