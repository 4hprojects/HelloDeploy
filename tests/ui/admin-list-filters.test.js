import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readView = (path) =>
  readFile(new URL(`../../apps/web/src/views/pages/${path}`, import.meta.url), 'utf8');

const usersForm = filterForm(await readView('admin/users.ejs'));
const projectsForm = filterForm(await readView('admin/projects.ejs'));

function filterForm(template) {
  const start = template.indexOf('<form method="GET"');
  return template.slice(start, template.indexOf('</form>', start));
}

const ids = (form, pattern) => [...form.matchAll(pattern)].map((match) => match[1]).sort();
const controlIds = (form) => ids(form, /<(?:input|select)\b[^>]*\bid="([^"]+)"/g);
const labelTargets = (form) => ids(form, /<label\b[^>]*\bfor="([^"]+)"/g);
const autoSubmitNames = (form) => ids(form, /<select\b[^>]*\bname="([^"]+)"[^>]*data-auto-submit/g);

const ATTACHED_SEARCH_BUTTON =
  /<div class="search-field">\s*<input[^\n]*type="search"[^\n]*>\s*<button[^>]*type="submit">Search<\/button>/;

describe('admin users filters', () => {
  it('applies the status and role filters as soon as they change', () => {
    assert.deepEqual(autoSubmitNames(usersForm), ['role', 'status']);
  });

  it('attaches a Search button to the search box', () => {
    assert.match(usersForm, ATTACHED_SEARCH_BUTTON);
  });

  it('no longer needs a separate Filter button', () => {
    assert.doesNotMatch(usersForm, />\s*Filter\s*</);
  });

  it('gives every control a visible label', () => {
    const expected = ['user-role', 'user-search', 'user-status'];
    assert.deepEqual(
      { labels: labelTargets(usersForm), controls: controlIds(usersForm) },
      { labels: expected, controls: expected },
    );
  });
});

describe('admin projects filters', () => {
  it('applies the status filter as soon as it changes', () => {
    assert.deepEqual(autoSubmitNames(projectsForm), ['status']);
  });

  it('attaches a Search button to the search box', () => {
    assert.match(projectsForm, ATTACHED_SEARCH_BUTTON);
  });

  it('no longer needs a separate Filter button', () => {
    assert.doesNotMatch(projectsForm, />\s*Filter\s*</);
  });

  it('gives every control a visible label', () => {
    const expected = ['admin-project-search', 'admin-project-status'];
    assert.deepEqual(
      { labels: labelTargets(projectsForm), controls: controlIds(projectsForm) },
      { labels: expected, controls: expected },
    );
  });
});
