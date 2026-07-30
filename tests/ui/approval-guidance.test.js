import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { ApprovalStatus } from '@hellodeploy/contracts';

const ownerView = await readFile(
  new URL('../../apps/web/src/views/pages/projects/show.ejs', import.meta.url),
  'utf8',
);
const settingsView = await readFile(
  new URL('../../apps/web/src/views/pages/projects/settings.ejs', import.meta.url),
  'utf8',
);
const adminView = await readFile(
  new URL('../../apps/web/src/views/pages/admin/approval-requests.ejs', import.meta.url),
  'utf8',
);
const projectController = await readFile(
  new URL('../../apps/web/src/controllers/project.controller.js', import.meta.url),
  'utf8',
);
const adminController = await readFile(
  new URL('../../apps/web/src/controllers/admin.controller.js', import.meta.url),
  'utf8',
);
const adminRoutes = await readFile(
  new URL('../../apps/web/src/routes/pages/admin.routes.js', import.meta.url),
  'utf8',
);

describe('initial project approval guidance', () => {
  it('exposes the compatible changes-requested status', () => {
    assert.equal(ApprovalStatus.CHANGES_REQUESTED, 'CHANGES_REQUESTED');
    assert.equal(ApprovalStatus.REJECTED, 'REJECTED');
  });

  it('collects a safe purpose and shows readiness and owner feedback', () => {
    assert.match(ownerView, /What does this application do\?/);
    assert.match(ownerView, /Do not include passwords or other secrets/);
    assert.match(ownerView, /What needs attention/);
    assert.match(ownerView, /item\.status !== 'PASS'|attentionFindings/);
    assert.match(ownerView, /Administrator note/);
    assert.match(ownerView, /Resubmit for review/);
    assert.match(projectController, /submitForReview\(\{[\s\S]*?purpose: req\.body\.purpose/);
  });

  it('gives admins the submitted source, configuration, findings, and two decisions', () => {
    assert.match(adminView, /Application purpose/);
    assert.match(adminView, /Source repository/);
    assert.match(adminView, /Configuration summary/);
    assert.match(adminView, /Readiness at submission/);
    assert.match(adminView, /value="APPROVED"/);
    assert.match(adminView, /value="CHANGES_REQUESTED"/);
    assert.match(adminView, /Required when requesting changes/);
    assert.doesNotMatch(adminView, /value="REJECTED"/);
  });

  it('keeps admin authorization, object-id validation, and CSRF forms in the path', () => {
    assert.match(adminRoutes, /router\.use\(requireAuth, requireAdmin\)/);
    assert.match(adminRoutes, /'requestId'/);
    assert.match(adminRoutes, /router\.param\(param, validateObjectId\)/);
    assert.match(adminView, /partials\/csrf-field/);
    assert.match(adminController, /ApprovalStatus\.CHANGES_REQUESTED/);
  });

  it('does not accept Approval Required as a new deployment mode', () => {
    assert.match(
      projectController,
      /const allowed = \[DeploymentMode\.MANUAL, DeploymentMode\.AUTOMATIC\]/,
    );
    assert.doesNotMatch(settingsView, /\['MANUAL', 'AUTOMATIC', 'APPROVAL_REQUIRED'\]/);
    assert.match(settingsView, /Approval Required is not currently supported/);
    assert.match(ownerView, /Approval required \(legacy\)/);
  });
});
