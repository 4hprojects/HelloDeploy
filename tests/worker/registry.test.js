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
});
