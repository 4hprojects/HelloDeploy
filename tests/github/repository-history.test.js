import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const originalFetch = global.fetch;
const { getRepositoryHistory } = await import('../../apps/web/src/services/github.service.js');

afterEach(() => {
  global.fetch = originalFetch;
});

const PUBLIC_REPOSITORY = { fullName: 'example/app', installationId: null };
const REPO_PATH = 'https://api.github.com/repos/example/app';

function jsonResponse(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function stubGithub({ commitsLink = null, commits = [{ sha: 'a' }], fork = false } = {}) {
  global.fetch = async (url) => {
    const path = String(url);
    if (path === REPO_PATH) {
      return jsonResponse({
        created_at: '2025-01-01T00:00:00Z',
        fork,
        owner: { login: 'example' },
      });
    }
    if (path.startsWith(`${REPO_PATH}/commits`)) {
      return jsonResponse(commits, commitsLink ? { link: commitsLink } : {});
    }
    if (path === 'https://api.github.com/users/example') {
      return jsonResponse({ created_at: '2020-06-01T00:00:00Z' });
    }
    return new Response('{}', { status: 404 });
  };
}

describe('getRepositoryHistory', () => {
  it('reads repository and owner creation dates from GitHub', async () => {
    stubGithub();
    const history = await getRepositoryHistory(PUBLIC_REPOSITORY, 'main');
    assert.deepEqual(
      { repo: history.repoCreatedAt.toISOString(), owner: history.ownerCreatedAt.toISOString() },
      { repo: '2025-01-01T00:00:00.000Z', owner: '2020-06-01T00:00:00.000Z' },
    );
  });

  it('counts branch commits from the last page link', async () => {
    stubGithub({
      commitsLink:
        '<https://api.github.com/repositories/1/commits?sha=main&per_page=1&page=2>; rel="next", ' +
        '<https://api.github.com/repositories/1/commits?sha=main&per_page=1&page=137>; rel="last"',
    });
    const history = await getRepositoryHistory(PUBLIC_REPOSITORY, 'main');
    assert.equal(history.commitCount, 137);
  });

  it('counts a single commit when GitHub returns no page links', async () => {
    stubGithub();
    const history = await getRepositoryHistory(PUBLIC_REPOSITORY, 'main');
    assert.equal(history.commitCount, 1);
  });

  it('reports a forked repository', async () => {
    stubGithub({ fork: true });
    const history = await getRepositoryHistory(PUBLIC_REPOSITORY, 'main');
    assert.equal(history.isFork, true);
  });

  it('fails when GitHub refuses a request', async () => {
    global.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(getRepositoryHistory(PUBLIC_REPOSITORY, 'main'), {
      code: 'REPOSITORY_UNAVAILABLE',
    });
  });
});
