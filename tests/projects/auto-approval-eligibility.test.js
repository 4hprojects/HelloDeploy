import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountTier, RuntimeType } from '@hellodeploy/contracts';

import { assessAutoApprovalEligibility } from '../../apps/web/src/services/approval-readiness.service.js';

const READY = { isReady: true, findings: [{ code: 'repository_access', status: 'PASS' }] };
const FREE_OWNER = { accountTier: AccountTier.FREE, isTrustedForAutoApproval: false };
const NOW = new Date('2026-11-27T12:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const ESTABLISHED = Object.freeze({
  repoCreatedAt: daysAgo(7),
  ownerCreatedAt: daysAgo(30),
  isFork: false,
  commitCount: 5,
});

function assess({
  runtimeType = RuntimeType.NODEJS,
  readiness = READY,
  owner = FREE_OWNER,
  hasPriorApproval = false,
  repositoryHistory = ESTABLISHED,
} = {}) {
  return assessAutoApprovalEligibility({
    project: { runtimeType },
    readiness,
    owner,
    hasPriorApproval,
    repositoryHistory,
    now: NOW,
  });
}

function assessStatic(history) {
  return assess({
    runtimeType: RuntimeType.STATIC,
    repositoryHistory: history === null ? null : { ...ESTABLISHED, ...history },
  });
}

describe('assessAutoApprovalEligibility', () => {
  it('approves a static site from an established repository', () => {
    assert.deepEqual(assess({ runtimeType: RuntimeType.STATIC }), {
      isEligible: true,
      reasons: ['low_risk_runtime', 'established_repository'],
    });
  });

  it('queues a static site from a repository younger than 7 days', () => {
    assert.deepEqual(assessStatic({ repoCreatedAt: daysAgo(6) }).reasons, ['repository_history']);
  });

  it('queues a static site from a GitHub account younger than 30 days', () => {
    assert.deepEqual(assessStatic({ ownerCreatedAt: daysAgo(29) }).reasons, ['repository_history']);
  });

  it('queues a static site from a forked repository', () => {
    assert.deepEqual(assessStatic({ isFork: true }).reasons, ['repository_history']);
  });

  it('queues a static site with fewer than 5 commits on its branch', () => {
    assert.deepEqual(assessStatic({ commitCount: 4 }).reasons, ['repository_history']);
  });

  it('queues a static site whose repository creation date is unknown', () => {
    assert.deepEqual(assessStatic({ repoCreatedAt: null }).reasons, ['repository_history']);
  });

  it('queues a static site when repository history could not be read', () => {
    assert.deepEqual(assessStatic(null).reasons, ['repository_history_unavailable']);
  });

  it('approves a static site from a trusted owner without repository history', () => {
    assert.deepEqual(
      assess({
        runtimeType: RuntimeType.STATIC,
        owner: { accountTier: AccountTier.FREE, isTrustedForAutoApproval: true },
        repositoryHistory: null,
      }),
      { isEligible: true, reasons: ['low_risk_runtime', 'trusted_owner'] },
    );
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
