import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PlatformRole, ProjectRole, UiMode, UserStatus } from '@hellodeploy/contracts';
import { User } from '@hellodeploy/database';

import { buildProjectNavigation } from '../../apps/web/src/config/project-navigation.js';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { postUiMode } = await import('../../apps/web/src/controllers/account.controller.js');

const sidebarView = await readFile(
  new URL('../../apps/web/src/views/partials/sidebar.ejs', import.meta.url),
  'utf8',
);

const localsMiddleware = await readFile(
  new URL('../../apps/web/src/middleware/locals.js', import.meta.url),
  'utf8',
);

const ownerNav = (uiMode) =>
  buildProjectNavigation('example', ProjectRole.OWNER, '/projects/example', uiMode).map(
    (item) => item.key,
  );

describe('interface mode navigation', () => {
  it('shows an owner only website-level pages in simple mode', () => {
    assert.deepEqual(ownerNav(UiMode.SIMPLE), [
      'overview',
      'deployments',
      'domains',
      'environment',
      'settings',
    ]);
  });

  it('shows an owner every page in advanced mode', () => {
    assert.deepEqual(ownerNav(UiMode.ADVANCED), [
      'overview',
      'deployments',
      'repository',
      'detection',
      'domains',
      'deploy-hook',
      'environment',
      'members',
      'settings',
    ]);
  });

  it('defaults to simple mode when no mode is supplied', () => {
    assert.deepEqual(
      buildProjectNavigation('example', ProjectRole.OWNER, '/projects/example').map(
        (item) => item.key,
      ),
      ownerNav(UiMode.SIMPLE),
    );
  });

  it('keeps role restrictions independent of mode', () => {
    const viewerAdvanced = buildProjectNavigation(
      'example',
      ProjectRole.VIEWER,
      '/projects/example',
      UiMode.ADVANCED,
    ).map((item) => item.key);

    assert.ok(!viewerAdvanced.includes('settings'));
  });

  it('hides the deploy hook from an owner in simple mode', () => {
    assert.ok(!ownerNav(UiMode.SIMPLE).includes('deploy-hook'));
  });
});

describe('interface mode request locals', () => {
  it('falls back to simple mode for sessions without the field', () => {
    assert.match(localsMiddleware, /res\.locals\.uiMode = req\.session\?\.user\?\.uiMode \?\?/);
  });
});

describe('interface mode switch control', () => {
  it('posts to the account mode endpoint', () => {
    assert.match(sidebarView, /action="\/account\/ui-mode"/);
  });

  it('offers both modes as submit values', () => {
    assert.match(sidebarView, /value="ADVANCED"/);
  });

  it('marks the active mode without relying on colour', () => {
    assert.match(sidebarView, /aria-pressed="<%= _uiMode === 'ADVANCED' \? 'true' : 'false' %>"/);
  });

  it('reassures the user that hidden settings are unchanged', () => {
    assert.match(sidebarView, /Nothing is changed or removed/);
  });

  it('is hidden from signed-out visitors', () => {
    assert.match(
      sidebarView,
      /<% if \(_user\) \{ %>\s*<div class="sidebar__section">\s*<p class="sidebar__section-title" id="ui-mode-label">/,
    );
  });
});

describe('interface mode endpoint', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function createUser() {
    return User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: `ada-${objectId()}@example.test`,
      passwordHash: 'hash',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
  }

  function fakeRequest(user, body) {
    const req = { body, session: { user: { id: user._id.toString(), uiMode: user.uiMode } } };
    req.flash = (type, message) => {
      req.flashed = { type, message };
    };
    return req;
  }

  function fakeResponse() {
    const res = { redirected: null };
    res.redirect = (url) => {
      res.redirected = url;
    };
    return res;
  }

  it('defaults a new account to simple mode', async () => {
    const user = await createUser();
    assert.equal(user.uiMode, UiMode.SIMPLE);
  });

  it('persists a switch to advanced mode', async () => {
    const user = await createUser();
    await postUiMode(
      fakeRequest(user, { uiMode: 'ADVANCED', returnTo: '/dashboard' }),
      fakeResponse(),
    );

    const reloaded = await User.findById(user._id);
    assert.equal(reloaded.uiMode, UiMode.ADVANCED);
  });

  it('mirrors the new mode into the session', async () => {
    const user = await createUser();
    const req = fakeRequest(user, { uiMode: 'ADVANCED', returnTo: '/dashboard' });
    await postUiMode(req, fakeResponse());

    assert.equal(req.session.user.uiMode, UiMode.ADVANCED);
  });

  it('returns the user to the page they came from', async () => {
    const user = await createUser();
    const res = fakeResponse();
    await postUiMode(fakeRequest(user, { uiMode: 'ADVANCED', returnTo: '/projects/example' }), res);

    assert.equal(res.redirected, '/projects/example');
  });

  it('leaves the stored mode untouched for an unknown mode', async () => {
    const user = await createUser();
    await postUiMode(
      fakeRequest(user, { uiMode: 'EXPERT', returnTo: '/dashboard' }),
      fakeResponse(),
    );

    const reloaded = await User.findById(user._id);
    assert.equal(reloaded.uiMode, UiMode.SIMPLE);
  });

  it('explains a rejected mode to the user', async () => {
    const user = await createUser();
    const req = fakeRequest(user, { uiMode: 'EXPERT', returnTo: '/dashboard' });
    await postUiMode(req, fakeResponse());

    assert.match(req.flashed.message, /not available/);
  });

  it('refuses a protocol-relative return path', async () => {
    const user = await createUser();
    const res = fakeResponse();
    await postUiMode(fakeRequest(user, { uiMode: 'SIMPLE', returnTo: '//evil.example' }), res);

    assert.equal(res.redirected, '/dashboard');
  });

  it('refuses an absolute return url', async () => {
    const user = await createUser();
    const res = fakeResponse();
    await postUiMode(
      fakeRequest(user, { uiMode: 'SIMPLE', returnTo: 'https://evil.example' }),
      res,
    );

    assert.equal(res.redirected, '/dashboard');
  });
});
