import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const checklist = await readFile(
  new URL('../../docs/LIVE_WORKFLOW_ACCEPTANCE.md', import.meta.url),
  'utf8',
);
const tracker = await readFile(
  new URL('../../docs/IMPLEMENTATION_BATCH_TRACKER.md', import.meta.url),
  'utf8',
);
const runbook = await readFile(
  new URL('../../docs/OPERATIONS_RUNBOOKS.md', import.meta.url),
  'utf8',
);

describe('live workflow documentation', () => {
  it('separates public, authenticated, and host evidence', () => {
    assert.match(checklist, /## Public Production Boundary/);
    assert.match(checklist, /## Local Ubuntu 26\.04 Pilot Host/);
    assert.match(checklist, /## Project-Owner Workflow/);
    assert.match(checklist, /## Operator Lifecycle Workflow/);
    assert.match(checklist, /Public HTTP evidence never proves/);
  });

  it('uses only the defined execution statuses in checklist table cells', () => {
    const statuses = [...checklist.matchAll(/\| (Passed|Failed|Blocked|Not Run) \|/g)].map(
      (match) => match[1],
    );
    assert.ok(statuses.includes('Passed'));
    assert.ok(statuses.includes('Failed'));
    assert.ok(statuses.includes('Blocked'));
    assert.doesNotMatch(checklist, /Passed with limitation/);
  });

  it('keeps the public deployment distinct from the release decision', () => {
    assert.match(tracker, /Live local pilot; productionization pending/);
    assert.match(tracker, /Release state\s+\| NO-GO for customer application hosting/);
    assert.match(checklist, /Current decision: \*\*NO-GO for customer application hosting\*\*/);
    assert.match(checklist, /Public dashboard availability is not evidence/);
    assert.match(checklist, /Ubuntu 26\.04 is a candidate platform/);
  });

  it('defines one ordered operator lifecycle with evidence safety', () => {
    assert.match(runbook, /## Ubuntu 26\.04 In-Place Baseline/);
    assert.match(runbook, /npm run host:baseline/);
    assert.match(runbook, /--allow-candidate-os/);
    assert.match(runbook, /HELLODEPLOY_ALLOW_CANDIDATE_OS=true/);
    assert.match(runbook, /Keep the current repository-run pilot/);
    assert.match(runbook, /## Ordered Production Workflow/);
    for (const stage of [
      'Preflight',
      'Configuration',
      'Install',
      'Verify',
      'Deploy',
      'Upgrade',
      'Rollback',
      'Backup',
      'Restore',
    ]) {
      assert.match(runbook, new RegExp(`\\*\\*${stage}:\\*\\*`));
    }
    assert.match(runbook, /Never capture environment values, cookies, session identifiers/);
  });
});
