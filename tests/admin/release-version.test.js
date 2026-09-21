import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

const { getReleaseVersion, resetReleaseVersionCache } =
  await import('../../apps/web/src/services/release-version.service.js');

const ORIGINAL_REF = process.env.HELLODEPLOY_RELEASE_REF;

describe('getReleaseVersion', () => {
  beforeEach(() => {
    resetReleaseVersionCache();
    delete process.env.HELLODEPLOY_RELEASE_REF;
  });
  afterEach(() => {
    resetReleaseVersionCache();
    if (ORIGINAL_REF === undefined) {
      delete process.env.HELLODEPLOY_RELEASE_REF;
    } else {
      process.env.HELLODEPLOY_RELEASE_REF = ORIGINAL_REF;
    }
  });

  it('prefers the ref the installer recorded', async () => {
    process.env.HELLODEPLOY_RELEASE_REF = 'b'.repeat(40);
    assert.equal((await getReleaseVersion()).commit, 'b'.repeat(40));
  });

  it('says where the ref came from', async () => {
    process.env.HELLODEPLOY_RELEASE_REF = 'b'.repeat(40);
    assert.equal((await getReleaseVersion()).source, 'environment');
  });

  it('falls back to the checkout HEAD', async () => {
    const version = await getReleaseVersion();
    assert.match(version.commit, /^[0-9a-f]{40}$/);
  });

  it('resolves once per process so it reports what is running', async () => {
    process.env.HELLODEPLOY_RELEASE_REF = 'c'.repeat(40);
    await getReleaseVersion();
    process.env.HELLODEPLOY_RELEASE_REF = 'd'.repeat(40);
    assert.equal((await getReleaseVersion()).commit, 'c'.repeat(40));
  });
});
