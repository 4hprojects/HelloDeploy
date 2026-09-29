import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';

import { User } from '@hellodeploy/database';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.GITHUB_APP_ID = '99999';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
// A developer .env may set a PATH, which env.js would otherwise prefer over the
// inline key above.
process.env.GITHUB_APP_PRIVATE_KEY_PATH = '';

const { listBranches } = await import('../../apps/web/src/services/github.service.js');
const { getBranches } = await import('../../apps/web/src/controllers/github.controller.js');

const INSTALLATION_ID = 4242;
const realFetch = globalThis.fetch;

/** Requested URLs, for asserting what actually went to GitHub. */
let requested = [];

/**
 * Answers the two GitHub endpoints these paths touch: the installation token
 * mint, and whatever resource the code under test asked for.
 */
function stubGitHub({ repositories = [], branches = [] } = {}) {
  requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const body = String(url).includes('/access_tokens')
      ? { token: 'ghs_stub' }
      : String(url).includes('/installation/repositories')
        ? { repositories }
        : branches;
    return { ok: true, status: 200, json: async () => body, text: async () => '' };
  };
}

function repo(fullName) {
  const [ownerLogin, name] = fullName.split('/');
  return {
    id: 1,
    node_id: 'n1',
    full_name: fullName,
    name,
    owner: { login: ownerLogin },
    default_branch: 'main',
    visibility: 'private',
    private: true,
  };
}

/** Captures whichever of status/json the handler reached for. */
function responseSpy() {
  const sent = { status: 200, body: undefined };
  const res = {
    status(code) {
      sent.status = code;
      return res;
    },
    json(body) {
      sent.body = body;
      return res;
    },
  };
  return { res, sent };
}

/**
 * An installation id plus the app's private key mints a token that reads that
 * installation's private code. Branch listings must therefore be gated on the
 * installation's own repository listing, not on the name the caller submitted.
 */
describe('listing branches for a repository', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
    stubGitHub();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function connectedUser() {
    return User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      passwordHash: 'x',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
      githubInstallationId: INSTALLATION_ID,
    });
  }

  function requestFor(user, fullName) {
    return { query: { fullName }, session: { user: { id: user._id.toString() } } };
  }

  it('returns the branches of a repository the installation holds', async () => {
    const user = await connectedUser();
    stubGitHub({
      repositories: [repo('acme/site')],
      branches: [{ name: 'main', commit: { sha: 'a' } }],
    });
    const { res, sent } = responseSpy();

    await getBranches(requestFor(user, 'acme/site'), res, () => {});

    assert.deepEqual(sent.body, { branches: [{ name: 'main', sha: 'a' }] });
  });

  it('refuses a repository absent from the installation listing', async () => {
    const user = await connectedUser();
    stubGitHub({ repositories: [repo('acme/site')] });
    const { res, sent } = responseSpy();

    await getBranches(requestFor(user, 'victim/private-app'), res, () => {});

    assert.equal(sent.status, 403);
  });

  it('sends no branch request for an unauthorized repository', async () => {
    const user = await connectedUser();
    stubGitHub({ repositories: [repo('acme/site')] });
    const { res } = responseSpy();

    await getBranches(requestFor(user, 'victim/private-app'), res, () => {});

    assert.equal(
      requested.some((url) => url.includes('/branches')),
      false,
    );
  });
});

describe('building GitHub API paths from a repository name', () => {
  beforeEach(() => {
    stubGitHub({ branches: [] });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('builds the plain repository path for a well-formed name', async () => {
    await listBranches(INSTALLATION_ID, 'acme/site');

    const branchesUrl = requested.find((url) => url.includes('/branches'));
    assert.equal(branchesUrl, 'https://api.github.com/repos/acme/site/branches?per_page=100');
  });

  it('refuses a name carrying extra path segments', async () => {
    await assert.rejects(() => listBranches(INSTALLATION_ID, 'acme/site/../../installation'), {
      code: 'INVALID_REPOSITORY_NAME',
    });
  });

  it('refuses a traversal segment that URL encoding would leave intact', async () => {
    await assert.rejects(() => listBranches(INSTALLATION_ID, '../installation'), {
      code: 'INVALID_REPOSITORY_NAME',
    });
  });

  it('sends no request at all when the name is malformed', async () => {
    await listBranches(INSTALLATION_ID, '../installation').catch(() => {});

    assert.equal(requested.length, 0);
  });
});
