import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const files = {
  icon: await readFile(
    new URL('../../apps/web/src/views/partials/icon.ejs', import.meta.url),
    'utf8',
  ),
  sidebar: await readFile(
    new URL('../../apps/web/src/views/partials/sidebar.ejs', import.meta.url),
    'utf8',
  ),
  projectNavigation: await readFile(
    new URL('../../apps/web/src/config/project-navigation.js', import.meta.url),
    'utf8',
  ),
  header: await readFile(
    new URL('../../apps/web/src/views/partials/header.ejs', import.meta.url),
    'utf8',
  ),
  footer: await readFile(
    new URL('../../apps/web/src/views/partials/footer.ejs', import.meta.url),
    'utf8',
  ),
  flash: await readFile(
    new URL('../../apps/web/src/views/partials/flash-banner.ejs', import.meta.url),
    'utf8',
  ),
  passwordField: await readFile(
    new URL('../../apps/web/src/views/partials/password-field.ejs', import.meta.url),
    'utf8',
  ),
  landing: await readFile(
    new URL('../../apps/web/src/views/pages/index.ejs', import.meta.url),
    'utf8',
  ),
  domains: await readFile(
    new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
    'utf8',
  ),
  componentsCss: await readFile(
    new URL('../../apps/web/public/css/components.css', import.meta.url),
    'utf8',
  ),
  layoutCss: await readFile(
    new URL('../../apps/web/public/css/layout.css', import.meta.url),
    'utf8',
  ),
};

describe('icon consistency', () => {
  it('defines a shared inline SVG icon partial and base styles', () => {
    assert.match(files.icon, /class="ui-icon/);
    assert.match(files.icon, /viewBox="0 0 24 24"/);
    assert.match(files.icon, /focusable="false"/);
    assert.match(files.componentsCss, /\.ui-icon/);
    assert.match(files.componentsCss, /stroke: currentColor/);
  });

  it('uses named icons for primary, project, and admin sidebar navigation', () => {
    ['dashboard', 'projects', 'reviews', 'audit', 'server'].forEach((name) => {
      assert.match(files.sidebar, new RegExp(`name: '${name}'`));
    });
    [
      'overview',
      'deploy',
      'repository',
      'detection',
      'domain',
      'environment',
      'users',
      'settings',
    ].forEach((name) => {
      assert.match(files.projectNavigation, new RegExp(`icon: '${name}'`));
    });
    assert.match(files.sidebar, /name: item\.icon/);
    assert.match(files.layoutCss, /\.sidebar__icon/);
    assert.doesNotMatch(files.sidebar, /[⊞◫◉▶⎇◎◈⚿◑◧◷]/);
  });

  it('uses shared icons for prominent symbolic controls and feedback', () => {
    assert.match(files.header, /name: 'sun'/);
    assert.match(files.header, /name: 'moon'/);
    assert.match(files.footer, /name: 'up'/);
    assert.match(files.flash, /name: 'check'/);
    assert.match(files.flash, /name: 'x'/);
    assert.match(files.flash, /name: 'info'/);
    assert.match(files.passwordField, /name: 'eye'/);
    assert.match(files.domains, /name: 'external'/);
  });

  it('draws every landing page feature icon from the shared partial', () => {
    const featureIcons = files.landing.match(/<p class="feature-icon">[\s\S]*?<\/p>/g) ?? [];

    assert.ok(featureIcons.length > 0);
    assert.deepEqual(
      featureIcons.filter((markup) => !markup.includes("include('../partials/icon'")),
      [],
    );
  });

  it('only asks the shared partial for icons it defines', () => {
    const requested = [...files.landing.matchAll(/name: '([a-z-]+)'/g)].map((match) => match[1]);

    assert.ok(requested.length > 0);
    assert.deepEqual(
      requested.filter((name) => !files.icon.includes(`${name}: '`)),
      [],
    );
  });

  it('keeps decorative glyphs off the landing page', () => {
    assert.doesNotMatch(files.landing, /[⎇▶⚿◈◑◷]/);
  });
});
