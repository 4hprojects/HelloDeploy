import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { User } from '@hellodeploy/database';
import {
  parseApply,
  repairEmailVerificationIndex,
} from '../../scripts/repair-email-verification-index.js';

describe('email verification index repair', () => {
  it('does not declare a TTL index on the user verification expiry', () => {
    assert.equal(
      User.schema
        .indexes()
        .some(
          ([keys, options]) => keys.emailVerificationExpiresAt && options.expireAfterSeconds === 0,
        ),
      false,
    );
  });

  it('is dry-run by default and drops only the exact unsafe index with --apply', async () => {
    const dropped = [];
    const collection = {
      async indexes() {
        return [
          { name: '_id_', key: { _id: 1 } },
          {
            name: 'emailVerificationExpiresAt_1',
            key: { emailVerificationExpiresAt: 1 },
            expireAfterSeconds: 0,
          },
          { name: 'unrelated_ttl', key: { createdAt: 1 }, expireAfterSeconds: 0 },
        ];
      },
      async dropIndex(name) {
        dropped.push(name);
      },
    };
    await repairEmailVerificationIndex(collection, { output: { write() {} } });
    assert.deepEqual(dropped, []);
    await repairEmailVerificationIndex(collection, { apply: true, output: { write() {} } });
    assert.deepEqual(dropped, ['emailVerificationExpiresAt_1']);
    assert.equal(parseApply(['--apply']), true);
    assert.throws(() => parseApply(['--confirm']), /Unknown/);
  });
});
