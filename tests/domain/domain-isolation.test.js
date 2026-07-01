import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const domainController = await readFile(
  new URL('../../apps/web/src/controllers/domain.controller.js', import.meta.url),
  'utf8',
);

const domainService = await readFile(
  new URL('../../apps/web/src/services/domain.service.js', import.meta.url),
  'utf8',
);

describe('domain project isolation', () => {
  it('scopes verification requests to the current project', () => {
    assert.match(
      domainService,
      /export async function requestVerification\(domainId, projectId, actorId, opts = \{\}\)/,
    );
    assert.match(domainService, /Domain\.findOne\(\{ _id: domainId, projectId \}\)\.lean\(\)/);
    assert.match(domainController, /requestVerification\(domainId, project\._id/);
  });

  it('scopes domain removal to the current project before route cleanup', () => {
    assert.match(
      domainService,
      /export async function removeDomain\(domainId, projectId, actorId, opts = \{\}\)/,
    );
    assert.match(domainService, /Domain\.findOne\(\{ _id: domainId, projectId \}\)/);
    assert.match(domainController, /removeDomain\(domainId, project\._id/);
  });
});
