import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertDistinctDatabaseTargets,
  parseDatabaseIdentity,
  validateCliArguments,
} from '../../scripts/migrate-hellotasks-to-hellodeploy-db.js';

describe('HelloDeploy database migration safeguards', () => {
  it('extracts a value-safe server/database identity without credentials or options', () => {
    assert.deepEqual(
      parseDatabaseIdentity(
        'mongodb+srv://user:password@cluster.example.test/hellodeploy_db?retryWrites=true',
      ),
      {
        server: 'mongodb+srv://cluster.example.test',
        database: 'hellodeploy_db',
      },
    );
  });

  it('rejects URIs without an explicit database', () => {
    assert.throws(
      () => parseDatabaseIdentity('mongodb://localhost:27017/'),
      /explicit database name/,
    );
  });

  it('rejects source and destination aliases for the same database', () => {
    assert.throws(
      () =>
        assertDistinctDatabaseTargets(
          'mongodb://first:secret@localhost:27017/hellodeploy_db?authSource=admin',
          'mongodb://second:secret@localhost:27017/hellodeploy_db?retryWrites=true',
        ),
      /must be different MongoDB databases/,
    );
  });

  it('accepts two named databases on the same server', () => {
    const result = assertDistinctDatabaseTargets(
      'mongodb://localhost:27017/hellotasks',
      'mongodb://localhost:27017/hellodeploy_db',
    );
    assert.equal(result.source.database, 'hellotasks');
    assert.equal(result.destination.database, 'hellodeploy_db');
  });

  it('accepts only one optional confirm flag without echoing rejected input', () => {
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
