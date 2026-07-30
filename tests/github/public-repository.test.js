import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { RepositorySourceError } from '@hellodeploy/contracts';

const originalFetch = global.fetch;
const { inspectPublicGithubRepository, listPublicGithubBranches, getPublicGithubLatestCommit } =
  await import('../../apps/web/src/services/github.service.js');

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('public GitHub repository metadata', () => {
  it('inspects public metadata without an authorization header', async () => {
    global.fetch = async (url, options) => {
      assert.match(String(url), /^https:\/\/api\.github\.com\/repos\/example\/app$/);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, undefined);
      return jsonResponse({
        id: 123,
        node_id: 'R_public',
        private: false,
        visibility: 'public',
        default_branch: 'main',
      });
    };
    const source = await inspectPublicGithubRepository('https://github.com/example/app');
    assert.equal(source.fullName, 'example/app');
    assert.equal(source.visibility, 'public');
  });

  it('returns bounded branch and commit metadata', async () => {
    const responses = [
      jsonResponse([
        { name: 'main', commit: { sha: 'a'.repeat(40) } },
        { name: 'release', commit: { sha: 'b'.repeat(40) } },
      ]),
      jsonResponse({
        sha: 'C'.repeat(40),
        commit: { message: 'Release\nbody', author: { name: 'Example', date: '2026-01-01' } },
      }),
    ];
    global.fetch = async () => responses.shift();
    const source = { ownerLogin: 'example', name: 'app' };
    const branches = await listPublicGithubBranches(source);
    const commit = await getPublicGithubLatestCommit(source, 'main');
    assert.deepEqual(
      branches.map((branch) => branch.name),
      ['main', 'release'],
    );
    assert.equal(commit.sha, 'c'.repeat(40));
    assert.equal(commit.message, 'Release');
  });

  it('classifies private or unavailable repositories without exposing provider bodies', async () => {
    global.fetch = async () =>
      jsonResponse({ message: 'sensitive provider detail' }, { status: 404 });
    await assert.rejects(
      () => inspectPublicGithubRepository('https://github.com/example/private'),
      (err) =>
        err instanceof RepositorySourceError &&
        err.code === 'REPOSITORY_NOT_PUBLIC' &&
        !err.message.includes('sensitive'),
    );
  });

  it('classifies provider rate limiting', async () => {
    global.fetch = async () =>
      jsonResponse({}, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    await assert.rejects(
      () => inspectPublicGithubRepository('https://github.com/example/app'),
      (err) => err.code === 'REPOSITORY_RATE_LIMITED',
    );
  });

  it('stops reading an oversized response without relying on Content-Length', async () => {
    global.fetch = async () =>
      new Response('x'.repeat(1_000_001), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    await assert.rejects(
      () => inspectPublicGithubRepository('https://github.com/example/app'),
      (err) => err.code === 'REPOSITORY_UNAVAILABLE' && /too large/i.test(err.message),
    );
  });
});
