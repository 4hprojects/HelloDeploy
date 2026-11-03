import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';

const formFieldPath = fileURLToPath(
  new URL('../../apps/web/src/views/partials/form-field.ejs', import.meta.url),
);

function renderField(locals) {
  return ejs.renderFile(formFieldPath, {
    fieldId: 'project-name',
    label: 'Project name',
    name: 'name',
    ...locals,
  });
}

describe('form field validation state', () => {
  it('marks the input invalid when the server returned an error', async () => {
    const html = await renderField({ error: 'Name is required.' });

    assert.match(html, /aria-invalid="true"/);
  });

  it('leaves a valid input unmarked', async () => {
    const html = await renderField({ hint: 'Shown in your dashboard.' });

    assert.doesNotMatch(html, /aria-invalid/);
  });
});
