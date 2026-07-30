import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Repository } from '@hellodeploy/database';
import { RepositorySourceType } from '@hellodeploy/contracts';
import { clearTestDb, objectId, startTestDb, stopTestDb } from '../helpers/worker-db.js';

describe('repository source model', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('keeps legacy GitHub App records compatible', async () => {
    const repository = await Repository.create({
      projectId: objectId(),
      installationId: 1,
      githubRepoId: 2,
      nodeId: 'R_test',
      fullName: 'owner/repo',
      ownerLogin: 'owner',
      name: 'repo',
    });
    assert.equal(repository.sourceType, RepositorySourceType.GITHUB_APP);
  });

  it('accepts a canonical public source without installation identifiers', async () => {
    const repository = await Repository.create({
      projectId: objectId(),
      sourceType: RepositorySourceType.PUBLIC_GIT,
      provider: 'GITHUB',
      canonicalCloneUrl: 'https://github.com/owner/repo.git',
      fullName: 'owner/repo',
      ownerLogin: 'owner',
      name: 'repo',
      visibility: 'public',
    });
    assert.equal(repository.installationId, null);
  });

  it('rejects mismatched or credential-bearing public clone metadata', async () => {
    await assert.rejects(
      () =>
        Repository.create({
          projectId: objectId(),
          sourceType: RepositorySourceType.PUBLIC_GIT,
          provider: 'GITHUB',
          canonicalCloneUrl: 'https://user:secret@github.com/other/repo.git',
          fullName: 'owner/repo',
          ownerLogin: 'owner',
          name: 'repo',
          visibility: 'public',
        }),
      /Public Git clone URL must be canonical/,
    );
  });
});
