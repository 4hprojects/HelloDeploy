import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const files = {
  footer: await readFile(
    new URL('../../apps/web/src/views/partials/footer.ejs', import.meta.url),
    'utf8',
  ),
  appJs: await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8'),
  componentsCss: await readFile(
    new URL('../../apps/web/public/css/components.css', import.meta.url),
    'utf8',
  ),
  signIn: await readFile(
    new URL('../../apps/web/src/views/pages/auth/sign-in.ejs', import.meta.url),
    'utf8',
  ),
  createAccount: await readFile(
    new URL('../../apps/web/src/views/pages/auth/create-account.ejs', import.meta.url),
    'utf8',
  ),
  deployments: await readFile(
    new URL('../../apps/web/src/views/pages/projects/deployments.ejs', import.meta.url),
    'utf8',
  ),
  repository: await readFile(
    new URL('../../apps/web/src/views/pages/projects/repository.ejs', import.meta.url),
    'utf8',
  ),
  domains: await readFile(
    new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
    'utf8',
  ),
  detection: await readFile(
    new URL('../../apps/web/src/views/pages/projects/detection.ejs', import.meta.url),
    'utf8',
  ),
  adminServer: await readFile(
    new URL('../../apps/web/src/views/pages/admin/server.ejs', import.meta.url),
    'utf8',
  ),
};

describe('form pending states', () => {
  it('adds a shared submit handler that prevents duplicate submissions', () => {
    assert.match(files.appJs, /data-submitting/);
    assert.match(files.appJs, /e\.preventDefault\(\)/);
    assert.match(files.appJs, /form\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(files.appJs, /form\.classList\.add\('form--pending'\)/);
    assert.match(files.appJs, /button\.disabled = true/);
    assert.match(files.appJs, /setSubmitterText\(submitter, pendingLabel\(form, submitter\)\)/);
  });

  it('uses action-specific labels with a safe fallback', () => {
    assert.match(files.appJs, /data-pending-label/);
    assert.match(files.appJs, /data-confirm-pending-label/);
    assert.match(files.appJs, /'Working\.\.\.'/);
    assert.match(files.signIn, /data-pending-label="Signing in\.\.\."/);
    assert.match(files.createAccount, /data-pending-label="Creating\.\.\."/);
    assert.match(files.deployments, /data-pending-label="Deploying\.\.\."/);
    assert.match(files.deployments, /data-pending-label="Retrying\.\.\."/);
    assert.match(files.repository, /data-pending-label="Connecting\.\.\."/);
    assert.match(files.domains, /data-pending-label="Checking\.\.\."/);
    assert.match(files.detection, /data-pending-label="Running\.\.\."/);
    assert.match(files.adminServer, /data-pending-label="Resuming\.\.\."/);
  });

  it('removes older one-off auth submit handlers', () => {
    assert.doesNotMatch(files.signIn, /addEventListener\('submit'/);
    assert.doesNotMatch(files.createAccount, /addEventListener\('submit'/);
    assert.doesNotMatch(files.signIn, /Signing in…/);
    assert.doesNotMatch(files.createAccount, /Creating account…/);
  });

  it('styles pending forms consistently', () => {
    assert.match(files.componentsCss, /\.form--pending/);
    assert.match(files.componentsCss, /\.form--pending \.button\[aria-disabled='true'\]/);
  });
});
