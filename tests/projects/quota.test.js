import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPlanDefaults } from '../../apps/web/src/services/quota.service.js';

describe('getPlanDefaults', () => {
  it('returns the correct default limits', () => {
    const defaults = getPlanDefaults();
    assert.equal(defaults.maxOwnedProjects, 1);
    assert.equal(defaults.maxRunningApps, 1);
    assert.equal(defaults.maxProjectMembers, 3);
    assert.equal(defaults.memoryMb, 256);
    assert.equal(defaults.cpuCores, 0.25);
    assert.equal(defaults.storageMb, 500);
    assert.equal(defaults.deploymentsPerMonth, 10);
    assert.equal(defaults.buildTimeoutSeconds, 300);
    assert.equal(defaults.maxCustomDomains, 1);
    assert.equal(defaults.maxRollbackReleases, 3);
    assert.equal(defaults.logRetentionDays, 7);
  });

  it('returns a new object each time (not a shared reference)', () => {
    const a = getPlanDefaults();
    const b = getPlanDefaults();
    a.maxOwnedProjects = 999;
    assert.equal(b.maxOwnedProjects, 1);
  });
});
