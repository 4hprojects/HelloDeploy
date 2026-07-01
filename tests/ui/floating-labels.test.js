import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const formField = await readFile(
  new URL('../../apps/web/src/views/partials/form-field.ejs', import.meta.url),
  'utf8',
);

const passwordField = await readFile(
  new URL('../../apps/web/src/views/partials/password-field.ejs', import.meta.url),
  'utf8',
);

const projectNew = await readFile(
  new URL('../../apps/web/src/views/pages/projects/new.ejs', import.meta.url),
  'utf8',
);

const projectEdit = await readFile(
  new URL('../../apps/web/src/views/pages/projects/edit.ejs', import.meta.url),
  'utf8',
);

const domains = await readFile(
  new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
  'utf8',
);

const environment = await readFile(
  new URL('../../apps/web/src/views/pages/projects/environment.ejs', import.meta.url),
  'utf8',
);

const members = await readFile(
  new URL('../../apps/web/src/views/pages/projects/members.ejs', import.meta.url),
  'utf8',
);

const quota = await readFile(
  new URL('../../apps/web/src/views/pages/admin/quota.ejs', import.meta.url),
  'utf8',
);

const server = await readFile(
  new URL('../../apps/web/src/views/pages/admin/server.ejs', import.meta.url),
  'utf8',
);

describe('floating label UI', () => {
  it('defines reusable floating-label styles for fields and groups', () => {
    assert.match(componentsCss, /\.form-field--floating/);
    assert.match(componentsCss, /\.form-group--floating/);
    assert.match(componentsCss, /:focus-within \.form-label/);
    assert.match(componentsCss, /:has\(\.form-input:not\(:placeholder-shown\)\)/);
    assert.match(componentsCss, /:has\(\.form-input:-webkit-autofill\)/);
  });

  it('updates reusable auth field partials without losing hints or password behavior', () => {
    assert.match(formField, /form-field form-field--floating/);
    assert.match(formField, /placeholder="<%= _placeholder \|\| ' ' %>"/);
    assert.match(formField, /id="<%= fieldId %>-hint"/);
    assert.match(passwordField, /form-field form-field--floating/);
    assert.match(passwordField, /placeholder=" "/);
    assert.match(passwordField, /password-toggle/);
  });

  it('applies floating labels to main project and admin forms', () => {
    assert.match(projectNew, /form-field form-field--floating/);
    assert.match(projectEdit, /form-field form-field--floating/);
    assert.match(domains, /form-group form-group--floating/);
    assert.match(environment, /form-group form-group--floating/);
    assert.match(members, /form-field form-field--floating/);
    assert.match(quota, /form-group form-group--floating/);
    assert.match(server, /form-group form-group--floating/);
  });
});
