import assert from 'node:assert/strict';
import { it, after } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync('rsa', {
  modulusLength: 2048,
}).privateKey.export({ type: 'pkcs8', format: 'pem' });
const { isCommitOnBranch } = await import('../../apps/web/src/services/github.service.js');
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
it('accepts only an ancestor of the configured branch in the connected repository', async () => {
  const sha = 'a'.repeat(40);
  for (const [state, base, accepted] of [
    ['ahead', sha, true],
    ['identical', sha, true],
    ['behind', sha, false],
    ['diverged', 'b'.repeat(40), false],
  ]) {
    globalThis.fetch = async (url) => {
      if (url.endsWith('/access_tokens')) {
        return Response.json({ token: 'test-token' });
      }
      assert.equal(url, `https://api.github.com/repos/owner/repo/compare/${sha}...release%2Fmain`);
      return Response.json({ status: state, merge_base_commit: { sha: base } });
    };
    assert.equal(await isCommitOnBranch(123, 'owner/repo', 'release/main', sha), accepted);
  }
  globalThis.fetch = async (url) =>
    url.endsWith('/access_tokens')
      ? Response.json({ token: 'test-token' })
      : new Response('', { status: 404 });
  assert.equal(await isCommitOnBranch(123, 'owner/repo', 'main', sha), false);
});

it('validates public repository ancestry without requesting an installation token', async () => {
  const sha = 'a'.repeat(40);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `https://api.github.com/repos/owner/repo/compare/${sha}...main`);
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ status: 'ahead', merge_base_commit: { sha } });
  };
  assert.equal(await isCommitOnBranch(null, 'owner/repo', 'main', sha), true);
  assert.equal(await isCommitOnBranch(null, 'owner/repo/evil', 'main', sha), false);
  assert.equal(await isCommitOnBranch(null, 'owner/repo', 'main', 'short'), false);
});
