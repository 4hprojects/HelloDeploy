import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const auditEventModel = await readFile(
  new URL('../../packages/database/src/models/audit-event.model.js', import.meta.url),
  'utf8',
);

const membershipModel = await readFile(
  new URL('../../packages/database/src/models/project-membership.model.js', import.meta.url),
  'utf8',
);

const deploymentModel = await readFile(
  new URL('../../packages/database/src/models/deployment.model.js', import.meta.url),
  'utf8',
);

const domainModel = await readFile(
  new URL('../../packages/database/src/models/domain.model.js', import.meta.url),
  'utf8',
);

describe('database indexes for high-traffic admin and project paths', () => {
  it('indexes project membership lookups by user and project', () => {
    assert.match(membershipModel, /projectMembershipSchema\.index\(\{ userId: 1 \}\)/);
    assert.match(membershipModel, /projectMembershipSchema\.index\(\{ projectId: 1, role: 1 \}\)/);
  });

  it('indexes project deployment ordering and status filters', () => {
    assert.match(deploymentModel, /deploymentSchema\.index\(\{ projectId: 1, sequenceNumber: 1 \}/);
    assert.match(deploymentModel, /deploymentSchema\.index\(\{ projectId: 1, status: 1 \}\)/);
  });

  it('indexes domain ownership, hostname claims, and status queues', () => {
    assert.match(
      domainModel,
      /domainSchema\.index\(\{ hostnameNormalized: 1 \}, \{ unique: true \}\)/,
    );
    assert.match(domainModel, /domainSchema\.index\(\{ projectId: 1 \}\)/);
    assert.match(domainModel, /domainSchema\.index\(\{ status: 1 \}\)/);
  });

  it('indexes audit event filters with createdAt sort support', () => {
    assert.match(auditEventModel, /auditEventSchema\.index\(\{ action: 1, createdAt: -1 \}\)/);
    assert.match(auditEventModel, /auditEventSchema\.index\(\{ outcome: 1, createdAt: -1 \}\)/);
    assert.match(auditEventModel, /auditEventSchema\.index\(\{ targetType: 1, createdAt: -1 \}\)/);
    assert.match(auditEventModel, /auditEventSchema\.index\(\{ targetId: 1, createdAt: -1 \}\)/);
  });
});
