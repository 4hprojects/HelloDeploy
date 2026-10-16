import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertWorkerMayUseDatabase,
  guardWorkerDatabase,
} from '../../apps/worker/src/config/database-guard.js';

const environmentId = 'acceptance-lab-01';
const nonproductionMarker = {
  schemaVersion: 1,
  environmentClass: 'nonproduction',
  environmentId,
};

describe('assertWorkerMayUseDatabase', () => {
  it('refuses a development worker on a production database', () => {
    assert.throws(
      () =>
        assertWorkerMayUseDatabase({
          isProduction: false,
          marker: 'production',
        }),
      { name: 'ConfigurationError' },
    );
  });

  it('lets the production worker use its own database', () => {
    assert.doesNotThrow(() =>
      assertWorkerMayUseDatabase({ isProduction: true, marker: 'production' }),
    );
  });

  it('lets a development worker use a database production never marked', () => {
    assert.doesNotThrow(() =>
      assertWorkerMayUseDatabase({ isProduction: false, marker: undefined }),
    );
  });

  it('requires the exact registered nonproduction environment id', () => {
    assert.doesNotThrow(() =>
      assertWorkerMayUseDatabase({
        isProduction: true,
        marker: nonproductionMarker,
        nonproductionEnvironmentId: environmentId,
      }),
    );
    assert.throws(
      () =>
        assertWorkerMayUseDatabase({
          isProduction: true,
          marker: nonproductionMarker,
          nonproductionEnvironmentId: 'different-lab-01',
        }),
      { name: 'ConfigurationError' },
    );
  });

  it('rejects malformed and cross-class markers', () => {
    for (const marker of [
      'production',
      { environmentClass: 'nonproduction', environmentId },
      { ...nonproductionMarker, environmentClass: 'production' },
    ]) {
      assert.throws(
        () =>
          assertWorkerMayUseDatabase({
            isProduction: true,
            marker,
            nonproductionEnvironmentId: environmentId,
          }),
        { name: 'ConfigurationError' },
      );
    }
  });
});

function fakeSettings(initialValue) {
  let document =
    initialValue === undefined ? null : { key: 'deployment-environment', value: initialValue };
  const updates = [];
  return {
    updates,
    findOne: () => ({ lean: async () => document }),
    updateOne: async (_filter, update) => {
      updates.push(update);
      if (!document) {
        document = { key: 'deployment-environment', value: update.$setOnInsert.value };
      }
    },
  };
}

describe('guardWorkerDatabase', () => {
  it('registers an absent nonproduction marker once with setOnInsert', async () => {
    const settings = fakeSettings();
    await guardWorkerDatabase(
      { isProduction: true, nonproductionEnvironmentId: environmentId },
      settings,
    );
    assert.deepEqual(settings.updates, [{ $setOnInsert: { value: nonproductionMarker } }]);

    await guardWorkerDatabase(
      { isProduction: true, nonproductionEnvironmentId: environmentId },
      settings,
    );
    assert.equal(settings.updates.length, 1);
  });

  it('registers the backward-compatible production marker without overwriting', async () => {
    const settings = fakeSettings();
    await guardWorkerDatabase({ isProduction: true }, settings);
    assert.deepEqual(settings.updates, [{ $setOnInsert: { value: 'production' } }]);
  });

  it('never overwrites a conflicting marker', async () => {
    const settings = fakeSettings('production');
    await assert.rejects(
      guardWorkerDatabase(
        { isProduction: true, nonproductionEnvironmentId: environmentId },
        settings,
      ),
      { name: 'ConfigurationError' },
    );
    assert.deepEqual(settings.updates, []);
  });

  it('accepts a concurrent matching registration after a duplicate-key race', async () => {
    let reads = 0;
    const settings = {
      findOne: () => ({
        lean: async () => {
          reads += 1;
          return reads === 1 ? null : { value: nonproductionMarker };
        },
      }),
      updateOne: async () => {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      },
    };
    await assert.doesNotReject(
      guardWorkerDatabase(
        { isProduction: true, nonproductionEnvironmentId: environmentId },
        settings,
      ),
    );
  });
});
