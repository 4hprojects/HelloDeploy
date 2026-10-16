import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { normalizeApplicationRoot, validateApplicationRoot } from '@hellodeploy/contracts';
import { resolveApplicationRoot } from '../../apps/worker/src/deployment/build-context.js';

describe('application root contract', () => {
  it('accepts normalized repository-relative POSIX paths', () => {
    assert.equal(validateApplicationRoot('.'), null);
    assert.equal(normalizeApplicationRoot(' apps/web '), 'apps/web');
  });

  for (const value of ['/apps/web', '../web', 'apps/../web', 'apps//web', 'apps\\web', 'apps/']) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      assert.ok(validateApplicationRoot(value));
    });
  }

  it('rejects a directory symlink that escapes the checked-out repository', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'hellodeploy-root-'));
    const repository = join(parent, 'repository');
    const outside = join(parent, 'outside');
    await Promise.all([mkdir(repository), mkdir(outside)]);
    await symlink(outside, join(repository, 'app'));
    await assert.rejects(
      resolveApplicationRoot(repository, 'app'),
      /outside the checked-out repository/,
    );
  });

  it('resolves an in-repository application directory to its real path', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'hellodeploy-root-'));
    const application = join(repository, 'apps', 'web');
    await mkdir(application, { recursive: true });
    assert.equal(await resolveApplicationRoot(repository, 'apps/web'), application);
  });
});
