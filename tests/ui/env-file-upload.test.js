import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

const environment = await readFile(
  new URL('../../apps/web/src/views/pages/projects/environment.ejs', import.meta.url),
  'utf8',
);
const clientScript = await readFile(
  new URL('../../apps/web/public/js/app.js', import.meta.url),
  'utf8',
);
const mainLayout = await readFile(
  new URL('../../apps/web/src/views/layouts/main.ejs', import.meta.url),
  'utf8',
);
const environmentController = await readFile(
  new URL('../../apps/web/src/controllers/env-secret.controller.js', import.meta.url),
  'utf8',
);
const projectRoutes = await readFile(
  new URL('../../apps/web/src/routes/pages/project.routes.js', import.meta.url),
  'utf8',
);

describe('.env file upload UI', () => {
  it('offers a CSRF-protected import form while retaining manual entry', () => {
    assert.match(environment, /Upload \.env File/);
    assert.match(environment, /environment\/import/);
    assert.match(environment, /environment\/bulk-update/);
    assert.doesNotMatch(
      environment,
      /environment\/<%= encodeURIComponent\(secret\.name\) %>\/reveal/,
    );
    assert.match(environment, /include\('\.\.\/\.\.\/partials\/csrf-field'\)/);
    assert.match(environment, /data-env-file-input/);
    assert.match(environment, /Add Secret/);
    assert.match(environment, />Edit</);
    assert.match(environment, /Edit stored secrets/);
    assert.match(environment, /Unchanged — enter replacement/);
    assert.match(environment, /Blank keeps current/);
    assert.match(environment, /password-toggle/);
    assert.match(environment, /stays hidden unless the project owner chooses Show all values/);
    assert.doesNotMatch(environment, /Reveal value/);
    assert.doesNotMatch(projectRoutes, /environment\/:name\/reveal/);
  });

  // Values are revealed all at once, owner-only, after a confirmation dialog,
  // through a CSRF-protected POST so they never land in a URL or cached GET.
  it('reveals all values only through a confirmed, CSRF-protected POST', () => {
    assert.match(
      environment,
      /<form method="POST" action="\/projects\/<%= project\.slug %>\/environment\/reveal"\s+data-confirm=/,
    );
  });

  it('limits revealing values to the project owner', () => {
    assert.match(
      projectRoutes,
      /router\.post\('\/:slug\/environment\/reveal', requireAuth, ownerOnly, postRevealSecrets\)/,
    );
  });

  it('reads the selected file into the protected form without logging its contents', () => {
    assert.match(clientScript, /typeof file\.text === 'function'/);
    assert.match(clientScript, /reader\.readAsText\(file\)/);
    assert.match(clientScript, /64 \* 1024/);
    assert.doesNotMatch(clientScript, /console\.(?:log|debug).*envFileContent/);
  });

  it('reviews parsed entries from the server preview and requires overwrite confirmation', () => {
    assert.match(clientScript, /fetch\(`\$\{form\.action\}\/preview`/);
    assert.match(clientScript, /form\.dataset\.confirmTitle = 'Import environment variables'/);
    assert.match(environment, /id="env-file-status"[\s\S]*aria-live="polite"/);
    assert.match(environment, /data-env-file-preview-rows/);
    assert.match(clientScript, /code\.textContent = entry\.name/);
  });

  it('lets each variable be removed, restored, and the whole file cleared before import', () => {
    assert.match(clientScript, /row\.removed \? 'Undo' : 'Remove'/);
    assert.match(environment, /data-env-file-clear/);
    assert.match(environment, /name="selections"/);
  });

  it('never builds review rows from HTML strings', () => {
    const reviewScript = clientScript.slice(
      clientScript.indexOf('function initEnvFileImport'),
      clientScript.indexOf('function initSettingsSectionNavigation'),
    );
    assert.doesNotMatch(reviewScript, /\.innerHTML = (?!initialStatus)/);
  });

  it('loads the manifest-resolved client bundle so the file listener is current', () => {
    assert.match(mainLayout, /assetPath\('js\/app\.js'\)/);
  });

  it('prevents secret-management responses from being browser-cached', () => {
    assert.match(environmentController, /Cache-Control', 'no-store'/);
    assert.match(environmentController, /Pragma', 'no-cache'/);
    assert.match(environmentController, /preventEnvironmentCaching\(res\)/);
  });
});
