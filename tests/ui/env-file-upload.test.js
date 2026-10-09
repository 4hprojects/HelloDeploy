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
const environmentService = await readFile(
  new URL('../../apps/web/src/services/env-secret.service.js', import.meta.url),
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
    assert.match(environment, /cannot be viewed again/);
    assert.match(environment, /permanently write-only/);
    assert.doesNotMatch(environment, /Reveal value/);
    assert.doesNotMatch(environmentController, /postRevealSecret/);
    assert.doesNotMatch(environmentService, /export async function revealSecretValue/);
    assert.doesNotMatch(projectRoutes, /environment\/:name\/reveal/);
  });

  it('reads the selected file into the protected form without logging its contents', () => {
    assert.match(clientScript, /typeof file\.text === 'function'/);
    assert.match(clientScript, /reader\.readAsText\(file\)/);
    assert.match(clientScript, /64 \* 1024/);
    assert.doesNotMatch(clientScript, /console\.(?:log|debug).*envFileContent/);
  });

  it('summarizes parsed entries and requires overwrite confirmation before import', () => {
    assert.match(clientScript, /function envEntryNames/);
    assert.match(clientScript, /Matching stored names will be replaced after confirmation/);
    assert.match(clientScript, /form\.dataset\.confirmTitle = 'Import environment variables'/);
    assert.match(clientScript, /entryCount === 0/);
    assert.match(environment, /id="env-file-status"[\s\S]*aria-live="polite"/);
    assert.match(environment, /data-env-file-preview-names/);
    assert.match(clientScript, /code\.textContent = name/);
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
