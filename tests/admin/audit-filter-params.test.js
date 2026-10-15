import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { readAuditFilters } = await import('../../apps/web/src/controllers/admin.controller.js');

describe('readAuditFilters', () => {
  it('drops the dates when the period changes away from custom', () => {
    const filters = readAuditFilters({ period: '', from: '2026-10-01', to: '2026-10-14' });
    assert.deepEqual([filters.from, filters.to], ['', '']);
  });

  it('keeps the dates for a custom range', () => {
    const filters = readAuditFilters({ period: 'custom', from: '2026-10-01', to: '2026-10-14' });
    assert.deepEqual([filters.from, filters.to], ['2026-10-01', '2026-10-14']);
  });

  it('keeps the dates of an older link that has no period', () => {
    const filters = readAuditFilters({ from: '2026-10-01' });
    assert.equal(filters.from, '2026-10-01');
  });

  it('ignores a bracketed parameter that arrives as an object', () => {
    const filters = readAuditFilters({ outcome: { $ne: null } });
    assert.equal(filters.outcome, '');
  });
});
