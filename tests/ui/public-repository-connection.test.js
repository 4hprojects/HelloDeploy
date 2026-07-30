import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const template = await readFile(
  new URL('../../apps/web/src/views/pages/projects/repository.ejs', import.meta.url),
  'utf8',
);
const browser = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');
const routes = await readFile(
  new URL('../../apps/web/src/routes/pages/project.routes.js', import.meta.url),
  'utf8',
);
const settings = await readFile(
  new URL('../../apps/web/src/views/pages/projects/settings.ejs', import.meta.url),
  'utf8',
);

describe('public repository connection UI', () => {
  it('offers public URL and GitHub App paths without claiming automatic public deploys', () => {
    assert.match(template, /Public Git Repository/);
    assert.match(template, /name="sourceType" value="PUBLIC_GIT"/);
    assert.match(template, /name="sourceType" value="GITHUB_APP"/);
    assert.match(template, /manual deployments only/i);
    assert.match(template, /Connect GitHub/);
    assert.match(template, /changes this project to Manual deployment mode/);
  });

  it('uses a CSRF-protected owner route for bounded inspection', () => {
    assert.match(routes, /repositoryInspectLimiter/);
    assert.match(routes, /ownerOnly,[\s\S]*postInspectPublicRepository/);
    assert.match(browser, /X-CSRF-Token/);
    assert.match(browser, /publicForm\.action \+ '\/inspect'/);
  });

  it('announces pending and error states and prevents duplicate connection', () => {
    assert.match(template, /aria-live="polite"/);
    assert.match(template, /role="alert" tabindex="-1"/);
    assert.match(browser, /inspectBtn\.disabled = true/);
    assert.match(browser, /publicConnect\.disabled = true/);
  });

  it('removes automatic mode from consolidated settings for public sources', () => {
    assert.match(settings, /repository\?\.sourceType === 'PUBLIC_GIT'/);
    assert.match(settings, /\['MANUAL'\]/);
    assert.doesNotMatch(settings, /\['MANUAL', 'APPROVAL_REQUIRED'\]/);
    assert.match(settings, /Automatic deployments require a GitHub App connection/);
  });
});
