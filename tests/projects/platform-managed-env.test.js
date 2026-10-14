import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assessInitialApprovalReadiness } from '../../apps/web/src/services/approval-readiness.service.js';

describe('readiness with a detection that still lists PORT', () => {
  // Detections saved before PORT became platform-managed still contain it;
  // the owner must not be told to set it.
  it('does not ask the owner to set PORT', () => {
    const readiness = assessInitialApprovalReadiness({
      project: { detection: { requiredEnvironmentVariables: ['PORT'] } },
      repository: null,
      configuredEnvironmentVariables: [],
    });

    assert.equal(
      readiness.findings.some((item) => item.code === 'required_environment'),
      false,
    );
  });

  it('still asks for the other detected variables', () => {
    const readiness = assessInitialApprovalReadiness({
      project: { detection: { requiredEnvironmentVariables: ['MONGODB_URI', 'PORT'] } },
      repository: null,
      configuredEnvironmentVariables: [],
    });

    assert.equal(
      readiness.findings.find((item) => item.code === 'required_environment')?.message,
      'Set the missing variables: MONGODB_URI.',
    );
  });
});
