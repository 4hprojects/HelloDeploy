import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DeploymentStatus, DomainStatus, getStatusPresentation } from '@hellodeploy/contracts';

describe('canonical status presentation', () => {
  it('translates deployment states without exposing raw enums', () => {
    assert.deepEqual(getStatusPresentation('deployment', DeploymentStatus.BUILDING), {
      label: 'Building app',
      tone: 'building',
      hint: 'Building the application release.',
      terminal: false,
    });
    assert.equal(getStatusPresentation('deployment', DeploymentStatus.HEALTHY).terminal, true);
    assert.equal(
      getStatusPresentation('deployment', DeploymentStatus.ROLLED_BACK).label,
      'Replaced',
    );
  });

  it('provides contextual domain guidance and a safe fallback', () => {
    assert.match(
      getStatusPresentation('domain', DomainStatus.PENDING_VERIFICATION).hint,
      /DNS record/,
    );
    assert.equal(getStatusPresentation('unknown', 'SOME_STATE').label, 'Some state');
  });
});
