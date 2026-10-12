import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { QuotaScope } from '@hellodeploy/contracts';

import { validateSetQuota } from '../../apps/web/src/validators/admin.validator.js';

const withReason = (body) => ({ reason: 'support ticket', ...body });

describe('validateSetQuota', () => {
  it('accepts valid integer and float fields', () => {
    const { limits } = validateSetQuota(
      withReason({ maxOwnedProjects: '5', memoryMb: '512', cpuCores: '1.5' }),
      QuotaScope.USER,
    );
    assert.deepEqual(limits, { maxOwnedProjects: 5, memoryMb: 512, cpuCores: 1.5 });
  });

  it('lists empty fields as cleared so their stored override is removed', () => {
    const { cleared } = validateSetQuota(withReason({ memoryMb: '' }), QuotaScope.PROJECT);
    assert.ok(cleared.includes('memoryMb'));
  });

  it('ignores user-only fields on a project scope', () => {
    const { limits } = validateSetQuota(
      withReason({ maxOwnedProjects: '9', memoryMb: '512' }),
      QuotaScope.PROJECT,
    );
    assert.deepEqual(limits, { memoryMb: 512 });
  });

  it('accepts no fields for a scope that has no editable limits', () => {
    const { limits } = validateSetQuota(withReason({ memoryMb: '512' }), QuotaScope.PLAN);
    assert.deepEqual(limits, {});
  });

  it('requires a reason', () => {
    const { errors } = validateSetQuota({ memoryMb: '512' }, QuotaScope.USER);
    assert.ok(errors.reason);
  });

  it('rejects a reason longer than 500 characters', () => {
    const { errors } = validateSetQuota({ reason: 'x'.repeat(501) }, QuotaScope.USER);
    assert.ok(errors.reason);
  });

  it('reports a per-field error for a non-numeric integer field instead of dropping it silently', () => {
    const { errors } = validateSetQuota(
      withReason({ maxOwnedProjects: 'unlimited' }),
      QuotaScope.USER,
    );
    assert.ok(errors.maxOwnedProjects);
  });

  it('reports an error for a negative value', () => {
    const { errors } = validateSetQuota(withReason({ maxRunningApps: '-1' }), QuotaScope.USER);
    assert.ok(errors.maxRunningApps);
  });

  it('reports an error for a non-integer value on an integer field', () => {
    const { errors } = validateSetQuota(
      withReason({ deploymentsPerMonth: '3.5' }),
      QuotaScope.USER,
    );
    assert.ok(errors.deploymentsPerMonth);
  });

  it('reports a per-field error for a non-numeric cpuCores value', () => {
    const { errors } = validateSetQuota(withReason({ cpuCores: 'lots' }), QuotaScope.USER);
    assert.ok(errors.cpuCores);
  });

  it('keeps valid fields when another field is invalid', () => {
    const { limits } = validateSetQuota(
      withReason({ maxOwnedProjects: 'bad', memoryMb: '256' }),
      QuotaScope.USER,
    );
    assert.deepEqual(limits, { memoryMb: 256 });
  });

  it('rejects a memory limit below the safe minimum', () => {
    const { errors } = validateSetQuota(withReason({ memoryMb: '0' }), QuotaScope.USER);
    assert.ok(errors.memoryMb);
  });

  it('rejects a value above the host ceiling', () => {
    const { errors } = validateSetQuota(withReason({ cpuCores: '8' }), QuotaScope.USER, {
      max: { cpuCores: 2 },
    });
    assert.match(errors.cpuCores, /at most 2/);
  });
});
