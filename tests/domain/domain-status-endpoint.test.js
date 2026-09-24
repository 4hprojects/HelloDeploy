import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const routes = await readFile(
  new URL('../../apps/web/src/routes/pages/project.routes.js', import.meta.url),
  'utf8',
);
const service = await readFile(
  new URL('../../apps/web/src/services/domain.service.js', import.meta.url),
  'utf8',
);

describe('domain status polling endpoint', () => {
  it('requires authentication and project membership', () => {
    assert.match(
      routes,
      /router\.get\('\/:slug\/domains\/status', requireAuth, anyRole, getDomainStatuses\)/,
    );
  });

  it('selects only the fields needed to detect a state change', () => {
    const start = service.indexOf('export async function getProjectDomainStatuses');
    const end = service.indexOf('export async function getPendingApprovalDomains', start);
    const implementation = service.slice(start, end);
    assert.match(implementation, /\.select\('_id status operationStartedAt updatedAt'\)/);
    assert.doesNotMatch(implementation, /verificationTokenHash/);
  });
});
