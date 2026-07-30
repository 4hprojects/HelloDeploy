import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePublicGithubRepositoryUrl,
  RepositoryProvider,
  RepositorySourceError,
  RepositorySourceType,
} from '@hellodeploy/contracts';

describe('public GitHub repository source contract', () => {
  it('normalizes supported HTTPS repository URLs', () => {
    const plain = normalizePublicGithubRepositoryUrl('https://github.com/example/hello-app');
    const suffixed = normalizePublicGithubRepositoryUrl('https://github.com/example/hello-app.git');

    assert.deepEqual(plain, suffixed);
    assert.equal(plain.sourceType, RepositorySourceType.PUBLIC_GIT);
    assert.equal(plain.provider, RepositoryProvider.GITHUB);
    assert.equal(plain.fullName, 'example/hello-app');
    assert.equal(plain.canonicalCloneUrl, 'https://github.com/example/hello-app.git');
  });

  for (const input of [
    'http://github.com/example/app',
    'https://github.example.com/example/app',
    'https://github.com.evil.example/example/app',
    'https://user:pass@github.com/example/app',
    'https://github.com:443/example/app',
    'https://github.com/example/app?token=value',
    'https://github.com/example/app#readme',
    'https://github.com/example/app/extra',
    'https://github.com/example%2Fapp',
    ' https://github.com/example/app',
    'file:///etc/passwd',
  ]) {
    it(`rejects unsafe input: ${input.replace(/pass|token=value/g, '[redacted]')}`, () => {
      assert.throws(() => normalizePublicGithubRepositoryUrl(input), RepositorySourceError);
    });
  }
});
