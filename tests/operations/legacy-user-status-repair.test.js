import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { UserStatus } from '@hellodeploy/contracts';
import { User } from '@hellodeploy/database';
import {
  repairLegacyUserStatuses,
  validateCliArguments,
} from '../../scripts/repair-legacy-user-status.js';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

const baseUser = {
  firstName: 'Legacy',
  lastName: 'User',
  email: 'legacy@example.test',
  passwordHash: 'stored-password-hash',
};

describe('legacy user status repair', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('is dry-run by default and updates only unclassified password accounts when confirmed', async () => {
    await User.collection.insertMany([
      baseUser,
      { ...baseUser, email: 'active@example.test', status: UserStatus.ACTIVE },
      { ...baseUser, email: 'suspended@example.test', status: UserStatus.SUSPENDED },
      {
        firstName: 'Google',
        lastName: 'Only',
        email: 'google@example.test',
        googleSubject: 'google-subject',
      },
    ]);

    const output = { write() {} };
    const dryRun = await repairLegacyUserStatuses(User.collection, { output });
    assert.deepEqual(dryRun, { eligibleCount: 1, modifiedCount: 0, remainingCount: 1 });
    assert.equal((await User.collection.findOne({ email: baseUser.email })).status, undefined);

    const confirmed = await repairLegacyUserStatuses(User.collection, { confirm: true, output });
    assert.deepEqual(confirmed, { eligibleCount: 1, modifiedCount: 1, remainingCount: 0 });

    const statuses = Object.fromEntries(
      (await User.collection.find({}).project({ email: 1, status: 1 }).toArray()).map((user) => [
        user.email,
        user.status,
      ]),
    );
    assert.equal(statuses['legacy@example.test'], UserStatus.ACTIVE);
    assert.equal(statuses['active@example.test'], UserStatus.ACTIVE);
    assert.equal(statuses['suspended@example.test'], UserStatus.SUSPENDED);
    assert.equal(statuses['google@example.test'], undefined);
  });

  it('is idempotent after a successful repair', async () => {
    await User.collection.insertOne(baseUser);
    const output = { write() {} };

    await repairLegacyUserStatuses(User.collection, { confirm: true, output });
    const repeated = await repairLegacyUserStatuses(User.collection, { confirm: true, output });

    assert.deepEqual(repeated, { eligibleCount: 0, modifiedCount: 0, remainingCount: 0 });
  });

  it('accepts only one optional confirmation flag without echoing rejected input', () => {
    assert.equal(validateCliArguments([]), false);
    assert.equal(validateCliArguments(['--confirm']), true);
    const sensitiveMistake = 'mongodb://user:password@example.test/database';
    assert.throws(
      () => validateCliArguments([sensitiveMistake]),
      (error) => !error.message.includes(sensitiveMistake),
    );
    assert.throws(() => validateCliArguments(['--confirm', '--confirm']), /duplicate/);
  });
});
