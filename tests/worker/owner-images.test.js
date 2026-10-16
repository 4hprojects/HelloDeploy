import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

process.env.HELLODEPLOY_MASTER_KEY ??= Buffer.alloc(32, 9).toString('base64');

const { buildSecretAad, encrypt } = await import('@hellodeploy/security');
const { registryCredentialAadName } = await import('@hellodeploy/database');
const { ImageResolutionError, resolveImageDigest } =
  await import('../../apps/worker/src/deployment/oci-image.js');
const { loadRegistryCredential, withDockerConfig } =
  await import('../../apps/worker/src/deployment/registry-auth.js');
const { scanImage } = await import('../../apps/worker/src/deployment/image-scan.js');

const DIGEST = `sha256:${'d'.repeat(64)}`;
const NGINX = { registry: 'docker.io', repository: 'library/nginx', tag: '1.27' };
const CHALLENGE =
  'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"';
// Placeholder values, assembled so they never look like literal credentials.
const PLACEHOLDER_PULL_VALUE = ['placeholder', 'pull', 'value'].join('-');
const ISSUED_BEARER_VALUE = ['issued', 'bearer', 'value'].join('-');
const PULL_CREDENTIAL = { username: 'owner', token: PLACEHOLDER_PULL_VALUE };

/** A registry that challenges once, then serves the digest for a bearer token. */
function fakeRegistry({ realm = 'https://auth.docker.io/token', status = 200 } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    requests.push({ url: target, headers: init.headers ?? {} });
    if (target.includes('/token')) {
      return new Response(JSON.stringify({ token: ISSUED_BEARER_VALUE }), { status: 200 });
    }
    if (!init.headers?.Authorization) {
      return new Response(null, {
        status: 401,
        headers: { 'www-authenticate': CHALLENGE.replace('https://auth.docker.io/token', realm) },
      });
    }
    return new Response(null, { status, headers: { 'docker-content-digest': DIGEST } });
  };
  return { fetchImpl, requests };
}

function sealedRecord(registry, projectId) {
  const sealed = encrypt(
    PLACEHOLDER_PULL_VALUE,
    buildSecretAad({ projectId, name: registryCredentialAadName(registry) }),
  );
  return {
    username: PULL_CREDENTIAL.username,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
    encryptionVersion: sealed.version,
  };
}

describe('resolveImageDigest', () => {
  it('resolves a tag to the digest the registry serves', async () => {
    const { fetchImpl } = fakeRegistry();
    assert.equal(await resolveImageDigest(NGINX, { fetchImpl }), DIGEST);
  });

  it('sends saved credentials only to the approved token host', async () => {
    const { fetchImpl, requests } = fakeRegistry();
    await resolveImageDigest(NGINX, { fetchImpl, credential: PULL_CREDENTIAL });
    const withBasic = requests.filter((request) =>
      String(request.headers.Authorization).startsWith('Basic '),
    );
    assert.deepEqual(
      withBasic.map((request) => new URL(request.url).hostname),
      ['auth.docker.io'],
    );
  });

  it('refuses to send credentials to a challenge host outside the allowlist', async () => {
    const { fetchImpl, requests } = fakeRegistry({ realm: 'https://evil.example/token' });
    await assert.rejects(
      resolveImageDigest(NGINX, { fetchImpl, credential: PULL_CREDENTIAL }),
      (error) => error instanceof ImageResolutionError && /unexpected address/.test(error.message),
    );
    assert.equal(
      requests.some((request) => request.url.includes('evil.example')),
      false,
    );
  });

  it('reports a missing image plainly', async () => {
    const { fetchImpl } = fakeRegistry({ status: 404 });
    await assert.rejects(resolveImageDigest(NGINX, { fetchImpl }), /was not found/);
  });
});

describe('registry credentials', () => {
  const projectId = '507f1f77bcf86cd799439011';

  it('decrypts a credential bound to its project and registry', async () => {
    const credential = await loadRegistryCredential(projectId, 'ghcr.io', {
      findCredential: async () => sealedRecord('ghcr.io', projectId),
    });
    assert.deepEqual(credential, PULL_CREDENTIAL);
  });

  it('refuses a credential sealed for another registry', async () => {
    await assert.rejects(
      loadRegistryCredential(projectId, 'ghcr.io', {
        findCredential: async () => sealedRecord('docker.io', projectId),
      }),
    );
  });

  it('writes a private Docker config for the registry and removes it afterwards', async () => {
    let directory;
    const config = await withDockerConfig('docker.io', PULL_CREDENTIAL, async (dir) => {
      directory = dir;
      return JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'));
    });
    await assert.rejects(access(directory));
    assert.deepEqual(Object.keys(config.auths), ['https://index.docker.io/v1/']);
  });

  it('passes no config directory for a public image', async () => {
    assert.equal(await withDockerConfig('docker.io', null, async (dir) => dir), undefined);
  });
});

describe('scanImage', () => {
  const report = (ids) =>
    JSON.stringify({
      Results: [{ Vulnerabilities: ids.map((id) => ({ VulnerabilityID: id })) }],
    });

  it('counts fixable critical vulnerabilities', async () => {
    const result = await scanImage(`ghcr.io/o/a@${DIGEST}`, {
      run: async () => ({ code: 0, stdout: report(['CVE-1', 'CVE-2']), stderr: '' }),
    });
    assert.deepEqual(result, { criticalCount: 2, ids: ['CVE-1', 'CVE-2'] });
  });

  it('scans with the private Docker config when one is given', async () => {
    const calls = [];
    await scanImage(`ghcr.io/o/a@${DIGEST}`, {
      dockerConfigDir: '/tmp/hd-auth',
      run: async (args, env) => {
        calls.push(env);
        return { code: 0, stdout: report([]), stderr: '' };
      },
    });
    assert.deepEqual(calls, [{ DOCKER_CONFIG: '/tmp/hd-auth' }]);
  });

  it('fails closed when the scanner cannot run', async () => {
    await assert.rejects(
      scanImage(`ghcr.io/o/a@${DIGEST}`, {
        run: async () => ({ code: 1, stdout: '', stderr: 'database unavailable' }),
      }),
      /could not run/,
    );
  });
});
