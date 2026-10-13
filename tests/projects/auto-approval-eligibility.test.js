import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountTier, RuntimeType } from '@hellodeploy/contracts';

import { assessAutoApprovalEligibility } from '../../apps/web/src/services/approval-readiness.service.js';

const READY = { isReady: true, findings: [{ code: 'repository_access', status: 'PASS' }] };
const FREE_OWNER = { accountTier: AccountTier.FREE, isTrustedForAutoApproval: false };

function assess({
  runtimeType = RuntimeType.NODEJS,
  readiness = READY,
  owner = FREE_OWNER,
  hasPriorApproval = false,
} = {}) {
  return assessAutoApprovalEligibility({
    project: { runtimeType },
    readiness,
    owner,
    hasPriorApproval,
  });
}

describe('assessAutoApprovalEligibility', () => {
  it('approves a static site from a free first-time owner', () => {
    assert.deepEqual(assess({ runtimeType: RuntimeType.STATIC }), {
      isEligible: true,
      reasons: ['low_risk_runtime'],
    });
  });

  it('approves a React site from a free first-time owner', () => {
    assert.equal(assess({ runtimeType: RuntimeType.REACT }).isEligible, true);
  });

  it('queues a server app from a free first-time owner', () => {
    assert.deepEqual(assess(), {
      isEligible: false,
      reasons: ['server_runtime_untrusted_owner'],
    });
  });

  it('approves a server app from a premium owner', () => {
    assert.deepEqual(
      assess({ owner: { accountTier: AccountTier.PREMIUM, isTrustedForAutoApproval: false } }),
      { isEligible: true, reasons: ['premium_account'] },
    );
  });

  it('approves a server app from an admin-trusted owner', () => {
    assert.deepEqual(
      assess({ owner: { accountTier: AccountTier.FREE, isTrustedForAutoApproval: true } }),
      { isEligible: true, reasons: ['trusted_owner'] },
    );
  });

  it('approves a server app from an owner with a previously approved project', () => {
    assert.deepEqual(assess({ hasPriorApproval: true }), {
      isEligible: true,
      reasons: ['prior_approval'],
    });
  });

  it('queues a server app when the owner record is missing', () => {
    assert.equal(assess({ owner: null }).isEligible, false);
  });

  it('queues a low-risk site that has application-check warnings', () => {
    const readiness = {
      isReady: true,
      findings: [{ code: 'detection_warning', status: 'WARNING' }],
    };
    assert.deepEqual(assess({ runtimeType: RuntimeType.STATIC, readiness }), {
      isEligible: false,
      reasons: ['detection_warnings'],
    });
  });

  it('queues a premium owner whose project is not ready', () => {
    const readiness = {
      isReady: false,
      findings: [{ code: 'production_branch', status: 'BLOCKING' }],
    };
    assert.deepEqual(assess({ readiness, owner: { accountTier: AccountTier.PREMIUM } }), {
      isEligible: false,
      reasons: ['not_ready'],
    });
  });

  it('approves a static site whose only note is informational', () => {
    const readiness = {
      isReady: true,
      findings: [{ code: 'detection_info', status: 'INFO' }],
    };
    assert.equal(assess({ runtimeType: RuntimeType.STATIC, readiness }).isEligible, true);
  });
});
