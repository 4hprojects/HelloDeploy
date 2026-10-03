import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Distinct synthetic proxy clients keep the real sign-in limiter enabled in this large matrix.
test.beforeEach(async ({ context }, testInfo) => {
  const id = createHash('sha256').update(testInfo.title).digest();
  await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.18.${id[0]}.${id[1]}` });
});

async function signIn(page) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email Address').fill('demo@hellodeploy.test');
  await page.getByLabel('Password').fill('FixturePass123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function assertFits(page, path) {
  await page.goto(path);
  await expect(page.locator('h1').first()).toBeVisible();
  const overflow = await page.evaluate(
    () => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
  );
  expect(overflow, `${path} must fit the viewport`).toBeLessThanOrEqual(1);
}

test.describe('responsive pack', () => {
  test.use({ serviceWorkers: 'block' });
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    test(`public, auth, and dashboard surfaces fit ${width}px`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        '/',
        '/docs',
        '/docs/domains',
        '/supported-apps',
        '/status',
        '/service-limits',
        '/auth/sign-in',
        '/auth/create-account',
        '/auth/forgot-password',
      ]) {
        await assertFits(page, path);
      }
      await signIn(page);
      for (const path of [
        '/dashboard',
        '/projects',
        '/projects/northstar-notes',
        '/projects/northstar-notes/deployments',
        '/projects/northstar-notes/domains',
        '/projects/northstar-notes/environment',
        '/projects/northstar-notes/settings',
      ]) {
        await assertFits(page, path);
      }
      await page.goto('/projects/northstar-notes/deployments');
      await page.getByRole('link', { name: '#6', exact: true }).click();
      expect(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    });
  }

  test('public drawer supports touch, focus, escape, route changes, and resizing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Toggle navigation' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const drawer = page.locator('#sidebar');
    await expect(drawer.getByRole('link', { name: 'Product', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('link', { name: 'Create Account' })).toBeFocused();
    expect(
      (await drawer.getByRole('link', { name: 'Create Account' }).boundingBox()).height,
    ).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await drawer.getByRole('link', { name: 'How It Works' }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.locator('body')).not.toHaveClass(/sidebar-drawer-open/);
    await expect(page.locator('main')).not.toHaveAttribute('inert');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: 'dismissed' });
      globalThis.dispatchEvent(event);
    });
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    for (const link of await page.locator('.header__desktop-link').all()) {
      const lines = await link.evaluate((element) => {
        const range = globalThis.document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      });
      expect(lines).toBe(1);
    }
    await expect(
      page.locator('.header__nav').getByRole('link', { name: 'Status', exact: true }),
    ).toHaveCount(0);
  });

  test('docs navigation and installation help are keyboard accessible on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto('/docs');
    await page.getByText('Documentation navigation', { exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Documentation topics' })
      .getByRole('link', { name: 'Domains', exact: true })
      .click();
    await expect(page).toHaveURL(/\/docs\/domains$/);
    await signIn(page);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await page.getByRole('button', { name: 'Installation help', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

for (const outcome of ['accepted', 'dismissed']) {
  test(`install prompt is user initiated and consumed after ${outcome}`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.header__install')).toBeHidden();
    await page.evaluate((choice) => {
      globalThis.window.promptCalls = 0;
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => {
        globalThis.window.promptCalls++;
      };
      event.userChoice = Promise.resolve({ outcome: choice });
      globalThis.window.dispatchEvent(event);
      globalThis.window.promptPrevented = event.defaultPrevented;
    }, outcome);
    expect(await page.evaluate(() => globalThis.window.promptPrevented)).toBe(true);
    expect(await page.evaluate(() => globalThis.window.promptCalls)).toBe(0);
    await page.locator('.header__install').click();
    expect(await page.evaluate(() => globalThis.window.promptCalls)).toBe(1);
    await expect(page.locator('.header__install')).toBeHidden();
    await page.evaluate(() => globalThis.window.dispatchEvent(new Event('appinstalled')));
    await expect(page.locator('[data-pwa-install]:visible')).toHaveCount(0);
  });
}

test('iOS guidance and standalone detection', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('.header__install').click();
  await expect(page.getByRole('dialog')).toContainText('Add to Home Screen');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.header__install').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.header__install')).toBeFocused();
  await page.addInitScript(() =>
    Object.defineProperty(globalThis.navigator, 'standalone', { value: true }),
  );
  await page.reload();
  await expect(page.locator('[data-pwa-install]:visible')).toHaveCount(0);
  await context.close();
});

test('built worker caches only public assets, serves offline fallback, and preserves logout', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const manifest = await (await page.request.get('/site.webmanifest')).json();
  expect(manifest.scope).toBe('/');
  expect(manifest.id).toBe('/');
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBeTruthy();
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok()).toBeTruthy();
  }
  const worker = await page.request.get('/sw.js');
  expect(worker.headers()['cache-control']).toContain('no-cache');
  expect(worker.headers()['service-worker-allowed']).toBe('/');
  await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller))
    .toBe(true);
  await signIn(page);
  await page.goto('/projects/northstar-notes/environment');
  await page.goto('/docs');
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await globalThis.caches.keys()).map(async (key) =>
          (await (await globalThis.caches.open(key)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      )
    ).flat(),
  );
  expect(cached.some((path) => path.startsWith('/assets-dist/'))).toBeTruthy();
  expect(
    cached.filter((path) => /^\/(auth|projects|dashboard|docs|api|admin)(\/|$)/.test(path)),
  ).toEqual([]);
  await context.setOffline(true);
  await expect(page.locator('#pwa-offline')).toBeVisible();
  await page.goto('/projects/northstar-notes/environment');
  await expect(page.getByRole('heading', { name: "You're offline." })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try Again' }).click();
  await expect(page.getByRole('heading', { name: 'Environment Variables' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.locator('#confirm-modal [data-confirm-accept]').click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test('worker update waits for consent and dirty-form confirmation', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller))
    .toBe(true);
  // Playwright cannot route updated worker main-script requests. Change only this
  // ignored build artifact to simulate a new release on the real fixture server.
  const workerPath = new URL('../../apps/web/public/assets-dist/sw.js', import.meta.url);
  const original = await readFile(workerPath, 'utf8');
  const sibling = await context.newPage();
  await sibling.goto('/auth/sign-in');
  await sibling.getByLabel('Email Address').fill('keep-this-tab@example.test');
  await page.evaluate(() => globalThis.caches.open('unrelated-test-cache'));
  try {
    await writeFile(
      workerPath,
      original.replace(/"version":"([a-f0-9]+)"/, '"version":"$1-test-update"'),
    );
    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill('unsaved@example.test');
    await page.evaluate(async () =>
      (await globalThis.navigator.serviceWorker.getRegistration()).update(),
    );
    await expect(page.locator('#pwa-update')).toBeVisible();
    await page.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(page.locator('#pwa-update')).toBeHidden();
    await page.reload();
    await page.getByLabel('Email Address').fill('unsaved@example.test');
    await expect(page.locator('#pwa-update')).toBeVisible();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Update Now' }).click();
    await expect(page.getByLabel('Email Address')).toHaveValue('unsaved@example.test');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Update Now' }).click();
    await expect(page.getByLabel('Email Address')).toHaveValue('');
    await expect(page.locator('#pwa-update')).toBeHidden();
    await expect(sibling.getByLabel('Email Address')).toHaveValue('keep-this-tab@example.test');
    const keys = await page.evaluate(() => globalThis.caches.keys());
    expect(keys).toContain('unrelated-test-cache');
    expect(keys.filter((key) => key.startsWith('hellodeploy-static-'))).toHaveLength(1);
    expect(keys.some((key) => key.endsWith('-test-update'))).toBeTruthy();
  } finally {
    await writeFile(workerPath, original);
    await sibling.close();
  }
});
