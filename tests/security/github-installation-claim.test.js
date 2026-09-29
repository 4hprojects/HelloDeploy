import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User } from '@hellodeploy/database';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

const { getGithubCallback } = await import('../../apps/web/src/controllers/github.controller.js');

/**
 * A GitHub App installation is authority over its repositories' source code:
 * HelloDeploy mints installation tokens from the stored id and clones private
 * repositories with them. The installation callback is a plain GET, so the
 * `installation_id` it carries is only a claim — these are the two checks that
 * stop one account binding another account's installation to itself.
 */
describe('binding a GitHub installation to an account', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function signedInUser(email) {
    return User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      passwordHash: 'x',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
  }

  function requestFor(user, query, sessionState) {
    return {
      query,
      session: {
        user: { id: user._id.toString() },
        githubConnectState: sessionState,
        save: (cb) => cb(),
      },
      flash: () => {},
      ip: '203.0.113.7',
      correlationId: 'test',
    };
  }

  function responseSpy() {
    return { redirect: () => {} };
  }

  it("stores the installation when the callback carries this flow's nonce", async () => {
    const user = await signedInUser('owner@example.com');

    await getGithubCallback(
      requestFor(
        user,
        { installation_id: '4242', state: 'a'.repeat(32) },
        { nonce: 'a'.repeat(32) },
      ),
      responseSpy(),
      () => {},
    );

    const stored = await User.findById(user._id).lean();
    assert.equal(stored.githubInstallationId, 4242);
  });

  it('refuses an installation id submitted without the flow nonce', async () => {
    const attacker = await signedInUser('attacker@example.com');

    await getGithubCallback(
      requestFor(attacker, { installation_id: '4242' }, undefined),
      responseSpy(),
      () => {},
    );

    const stored = await User.findById(attacker._id).lean();
    assert.equal(stored.githubInstallationId, null);
  });

  it('accepts a flow started without a project, as guided setup does', async () => {
    const user = await signedInUser('wizard@example.com');

    await getGithubCallback(
      requestFor(
        user,
        { installation_id: '4242', state: 'c'.repeat(32) },
        { projectSlug: undefined, nonce: 'c'.repeat(32) },
      ),
      responseSpy(),
      () => {},
    );

    const stored = await User.findById(user._id).lean();
    assert.equal(stored.githubInstallationId, 4242);
  });

  it('refuses an installation another account already holds', async () => {
    const victim = await signedInUser('victim@example.com');
    await User.updateOne({ _id: victim._id }, { $set: { githubInstallationId: 4242 } });
    const attacker = await signedInUser('attacker@example.com');

    await getGithubCallback(
      requestFor(
        attacker,
        { installation_id: '4242', state: 'b'.repeat(32) },
        { nonce: 'b'.repeat(32) },
      ),
      responseSpy(),
      () => {},
    );

    const stored = await User.findById(attacker._id).lean();
    assert.equal(stored.githubInstallationId, null);
  });
});
