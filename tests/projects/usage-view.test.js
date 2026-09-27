import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  buildUsageRows,
  buildAllocationRows,
} from '../../apps/web/src/services/usage-view.service.js';

const quota = { maxOwnedProjects: 3, maxCustomDomains: 1, maxProjectMembers: 3 };
const counts = { websites: 1, domains: 0, members: 1 };
const rowFor = (result, key) => result.rows.find((row) => row.key === key);

describe('usage rows', () => {
  it('reports what is used against the limit', () => {
    const result = buildUsageRows({ quota, counts });
    assert.equal(rowFor(result, 'websites').summary, '1 of 3');
  });

  it('flags a limit that has been reached', () => {
    const result = buildUsageRows({ quota, counts: { ...counts, websites: 3 } });
    assert.equal(rowFor(result, 'websites').isAtLimit, true);
  });

  it('warns one short of the limit', () => {
    const result = buildUsageRows({ quota, counts: { ...counts, websites: 2 } });
    assert.equal(rowFor(result, 'websites').isNearLimit, true);
  });

  it('does not warn when there is room left', () => {
    const result = buildUsageRows({ quota, counts });
    assert.equal(rowFor(result, 'websites').isNearLimit, false);
  });

  it('reports an unset limit as no limit', () => {
    const result = buildUsageRows({ quota: { ...quota, maxOwnedProjects: null }, counts });
    assert.equal(rowFor(result, 'websites').summary, '1 — no limit');
  });

  it('never claims an unlimited resource is at its limit', () => {
    const result = buildUsageRows({
      quota: { ...quota, maxOwnedProjects: null },
      counts: { ...counts, websites: 99 },
    });

    assert.equal(rowFor(result, 'websites').isAtLimit, false);
  });

  it('says when any limit has been reached', () => {
    const result = buildUsageRows({ quota, counts: { ...counts, websites: 3 } });
    assert.equal(result.isAnyAtLimit, true);
  });

  it('does not treat an unenforced limit as reachable', () => {
    // maxCustomDomains defaults to 1 and nothing checks it, so one domain must
    // not raise an at-limit warning about something the owner can still exceed.
    const result = buildUsageRows({ quota, counts: { ...counts, domains: 1 } });
    assert.equal(result.isAnyAtLimit, false);
  });

  it('explains each row in plain language', () => {
    const result = buildUsageRows({ quota, counts });
    assert.ok(result.rows.every((row) => Boolean(row.explain)));
  });
});

describe('usage shows only limits that are enforced', () => {
  it('omits build minutes, which nothing measures', () => {
    const result = buildUsageRows({ quota, counts });
    assert.ok(!result.rows.some((row) => /build/i.test(row.label)));
  });

  it('omits data transfer, which nothing measures', () => {
    const result = buildUsageRows({ quota, counts });
    assert.ok(!result.rows.some((row) => /transfer|bandwidth/i.test(row.label)));
  });

  it('omits storage, which is defined but unenforced', () => {
    const result = buildUsageRows({ quota: { ...quota, storageMb: 500 }, counts });
    assert.ok(!result.rows.some((row) => /storage/i.test(row.label)));
  });

  it('omits deployments per month, which is defined but unenforced', () => {
    const result = buildUsageRows({ quota: { ...quota, deploymentsPerMonth: 10 }, counts });
    assert.ok(!result.rows.some((row) => /month/i.test(row.label)));
  });

  it('records why the unenforced limits are left out', async () => {
    // Stated in the module so the omission reads as deliberate, not forgotten.
    const source = await readFile(
      new URL('../../apps/web/src/services/usage-view.service.js', import.meta.url),
      'utf8',
    );

    assert.match(source, /equally unenforced/);
  });

  it('reports domains as a count rather than an allowance', () => {
    const result = buildUsageRows({ quota, counts: { ...counts, domains: 2 } });
    assert.ok(!result.rows.some((row) => row.key === 'domains'));
  });

  it('still reports how many domains are in use', () => {
    const result = buildUsageRows({ quota, counts: { ...counts, domains: 2 } });
    assert.equal(result.counts.find((entry) => entry.key === 'domains').used, 2);
  });
});

describe('resource allocation, for advanced mode', () => {
  it('reports the memory limit', () => {
    assert.equal(buildAllocationRows({ memoryMb: 256 })[0].value, '256 MB');
  });

  it('falls back to a platform default rather than showing nothing', () => {
    assert.equal(buildAllocationRows({})[0].value, 'Platform default');
  });

  it('describes retained versions in the owner’s terms', () => {
    const rows = buildAllocationRows({ maxRollbackReleases: 3 });
    assert.ok(rows.some((row) => /restoring/i.test(row.label)));
  });
});
