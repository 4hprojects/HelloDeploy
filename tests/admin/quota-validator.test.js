import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateSetQuota } from '../../apps/web/src/validators/admin.validator.js';

describe('validateSetQuota', () => {
  it('accepts a fully empty form (no override fields set)', () => {
    const { hasErrors, limits } = validateSetQuota({});
    assert.equal(hasErrors, false);
    assert.deepEqual(limits, {});
  });

  it('accepts valid integer and float fields', () => {
    const { hasErrors, limits } = validateSetQuota({
      maxOwnedProjects: '5',
      memoryMb: '512',
      cpuCores: '1.5',
    });
    assert.equal(hasErrors, false);
    assert.deepEqual(limits, { maxOwnedProjects: 5, memoryMb: 512, cpuCores: 1.5 });
  });

  it('reports a per-field error for a non-numeric integer field instead of dropping it silently', () => {
    const { hasErrors, errors, limits } = validateSetQuota({ maxOwnedProjects: 'unlimited' });
    assert.equal(hasErrors, true);
    assert.ok(errors.maxOwnedProjects);
    assert.equal(limits.maxOwnedProjects, undefined);
  });

  it('reports an error for a negative value', () => {
    const { errors } = validateSetQuota({ maxRunningApps: '-1' });
    assert.ok(errors.maxRunningApps);
  });

  it('reports an error for a non-integer value on an integer field', () => {
    const { errors } = validateSetQuota({ deploymentsPerMonth: '3.5' });
    assert.ok(errors.deploymentsPerMonth);
  });

  it('reports a per-field error for a non-numeric cpuCores value', () => {
    const { errors, limits } = validateSetQuota({ cpuCores: 'lots' });
    assert.ok(errors.cpuCores);
    assert.equal(limits.cpuCores, undefined);
  });

  it('does not error on unrelated fields when one field is invalid', () => {
    const { errors, limits } = validateSetQuota({
      maxOwnedProjects: 'bad',
      memoryMb: '256',
    });
    assert.ok(errors.maxOwnedProjects);
    assert.equal(errors.memoryMb, undefined);
    assert.equal(limits.memoryMb, 256);
  });
});
