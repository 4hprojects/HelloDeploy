import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertWorkerMayUseDatabase } from '../../apps/worker/src/config/database-guard.js';

describe('assertWorkerMayUseDatabase', () => {
  it('refuses a routing-less worker on a production database', () => {
    assert.throws(
      () =>
        assertWorkerMayUseDatabase({
          isProduction: false,
          nginxEnabled: false,
          marker: 'production',
        }),
      { name: 'ConfigurationError' },
    );
  });

  it('lets the production worker use its own database', () => {
    assert.doesNotThrow(() =>
      assertWorkerMayUseDatabase({ isProduction: true, nginxEnabled: true, marker: 'production' }),
    );
  });

  it('lets a development worker use a database production never marked', () => {
    assert.doesNotThrow(() =>
      assertWorkerMayUseDatabase({ isProduction: false, nginxEnabled: false, marker: undefined }),
    );
  });
});
