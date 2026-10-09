import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const fixturePassword = 'FixturePass123!';

async function signIn(page, email = 'demo@hellodeploy.test') {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(fixturePassword);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test('public discovery, metadata, theme, and accessibility', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deploy your web app');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /https:\/\//);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  await page.getByRole('button', { name: /dark theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);

  for (const path of [
    '/how-it-works',
    '/docs',
    '/supported-apps',
    '/pilot',
    '/status',
    '/robots.txt',
    '/sitemap.xml',
  ]) {
    const response = await page.request.get(path);
    expect(response.ok(), `${path} should be publicly available`).toBeTruthy();
  }
});

test('how-it-works is indexable and accessible', async ({ page }) => {
  await page.goto('/how-it-works');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('From a GitHub repository');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/how-it-works$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', {
      name: 'How It Works',
    }),
  ).toHaveAttribute('aria-current', 'page');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});

test('docs guides a reader through a first deployment', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Deploy your first application',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/docs$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  await expect(page.locator('.docs-quick-start > li')).toHaveCount(5);
  const createAccount = page.getByRole('link', { name: 'Create Account' }).first();
  await createAccount.focus();
  await expect(createAccount).toBeFocused();
  let results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);

  await page.goto('/docs/getting-started');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Getting Started');
  await expect(page.getByRole('heading', { name: 'Complete your first deployment' })).toBeVisible();
  await expect(page.getByText('Deploy Latest', { exact: false })).toBeVisible();
  results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});

for (const path of ['/docs', '/docs/getting-started']) {
  for (const width of [320, 1440]) {
    test(`${path} has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const overflow = await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth -
          globalThis.document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}

for (const width of [320, 1440]) {
  test(`how-it-works has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/how-it-works');
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('authentication, dashboard, project, deployment, settings, and admin matrices', async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/projects');
  await expect(page.getByText('Northstar Notes').first()).toBeVisible();
  await page.goto('/projects/northstar-notes');
  await expect(page.getByRole('heading', { name: 'Northstar Notes' })).toBeVisible();
  await page.goto('/projects/northstar-notes/deployments');
  await expect(page.getByText('#7').first()).toBeVisible();
  await page.getByRole('link', { name: '#6' }).click();
  await expect(page.getByText('Deployment did not go live.')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry same commit' });
  await retry.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(retry).toBeFocused();
  await page.goto('/projects/northstar-notes/deployments');
  await page.getByRole('link', { name: '#5' }).click();
  await expect(page.locator('.card').filter({ hasText: 'Trigger' })).toContainText(
    'Replaced #3 (3333333) with target #4 (4444444).',
  );
  await page.goto('/projects/northstar-notes/deployments');
  await page.getByRole('link', { name: '#7' }).click();
  await expect(page.getByText(/Deployment #7/)).toBeVisible();
  await page.goto('/projects/northstar-notes/settings');
  await expect(page.getByRole('heading', { name: /Settings/ })).toBeVisible();
  await page.goto('/projects/northstar-notes/environment');
  await expect(page.getByRole('heading', { name: 'Environment Variables' })).toBeVisible();
  await page.goto('/projects/northstar-notes/domains');
  await expect(page.getByRole('heading', { name: 'Custom Domains' })).toBeVisible();
  await page.goto('/projects/northstar-notes/members');
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, 'admin@hellodeploy.test');
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: /Users/ })).toBeVisible();
  await page.goto('/admin/ux-metrics');
  await expect(page.getByRole('heading', { name: 'UX Metrics' })).toBeVisible();
});

const publicNavigationWidths = [320, 360, 390, 480, 481, 768, 769, 1023, 1024, 1280, 1440];

for (const width of publicNavigationWidths) {
  test(`public navigation is balanced at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const brand = page.locator('.header__brand');
    const wordmark = page.locator('.brand-logo__wordmark');
    const navigation = page.locator('.header__nav');
    const links = page.locator('#public-nav');
    const menuToggle = page.locator('#public-nav-toggle');
    const createAccount = navigation.getByRole('link', { name: 'Create Account' });
    const themeToggle = page.locator('#theme-toggle');

    await expect(brand).toBeVisible();
    await expect(createAccount).toBeVisible();
    await expect(themeToggle).toBeVisible();

    if (width <= 480) {
      await expect(wordmark).toBeHidden();
    } else {
      await expect(wordmark).toBeVisible();
    }

    for (const control of [createAccount, themeToggle]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(40);
    }

    const headerBounds = await page.evaluate(() => {
      const brandBox = globalThis.document.querySelector('.header__brand').getBoundingClientRect();
      const navBox = globalThis.document.querySelector('.header__nav').getBoundingClientRect();
      return {
        brandRight: brandBox.right,
        navLeft: navBox.left,
        navRight: navBox.right,
        viewportWidth: globalThis.innerWidth,
      };
    });
    expect(headerBounds.brandRight).toBeLessThanOrEqual(headerBounds.navLeft);
    expect(headerBounds.navRight).toBeLessThanOrEqual(headerBounds.viewportWidth);

    if (width < 1024) {
      await expect(menuToggle).toBeVisible();
      await expect(links).toBeHidden();
      const menuBox = await menuToggle.boundingBox();
      expect(menuBox?.width).toBeGreaterThanOrEqual(40);
      expect(menuBox?.height).toBeGreaterThanOrEqual(40);

      await menuToggle.click();
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(links).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(links).toBeHidden();
      await expect(menuToggle).toBeFocused();
    } else {
      await expect(menuToggle).toBeHidden();
      await expect(links).toBeVisible();
      const linkRows = await links.locator('a').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            top: Math.round(rect.top),
            whiteSpace: globalThis.getComputedStyle(element).whiteSpace,
          };
        }),
      );
      expect(new Set(linkRows.map(({ top }) => top)).size).toBe(1);
      expect(linkRows.every(({ whiteSpace }) => whiteSpace === 'nowrap')).toBeTruthy();
    }

    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    if (width === 390) {
      await themeToggle.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('.header')).toBeVisible();
    }
  });
}

test('compact public navigation resets when resized to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1023, height: 900 });
  await page.goto('/');
  const menuToggle = page.locator('#public-nav-toggle');
  const links = page.locator('#public-nav');

  await menuToggle.click();
  await expect(links).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(menuToggle).toBeHidden();
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(links).toBeVisible();
});

for (const width of [390, 1024]) {
  test(`auth header follows the public navigation contract at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/auth/sign-in');
    const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(primaryNavigation.getByRole('link', { name: 'Create Account' })).toBeVisible();
    await expect(page.locator('#public-nav-toggle')).toBeVisible({ visible: width < 1024 });
    await expect(page.locator('#public-nav')).toBeVisible({ visible: width >= 1024 });
  });
}

test('signed-in app header keeps the sidebar breakpoint independent', async ({ page }) => {
  await signIn(page);

  for (const width of [320, 480, 768, 769, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const sidebarToggle = page.locator('#sidebar-toggle');
    const wordmark = page.locator('.brand-logo__wordmark');
    const themeToggle = page.locator('#theme-toggle');

    await expect(sidebarToggle).toBeVisible({ visible: width <= 768 });
    await expect(wordmark).toBeVisible({ visible: width > 480 });
    await expect(themeToggle).toBeVisible();
    const themeBox = await themeToggle.boundingBox();
    expect(themeBox?.width).toBeGreaterThanOrEqual(40);
    expect(themeBox?.height).toBeGreaterThanOrEqual(40);

    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('keyboard focus is visible and returns after confirmation modal', async ({ page }) => {
  await signIn(page);
  await page.goto('/projects/northstar-notes/deployments');
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();
  await expect(focused).toHaveCSS('outline-style', /solid|auto/);
});

test('dashboard polling announces and removes a deployment after it finishes', async ({ page }) => {
  let requestCount = 0;
  await page.route('**/dashboard/status?*', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('ids').split(',')[0];
    requestCount += 1;
    const terminal = requestCount > 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        deployments: [
          {
            id,
            project: { name: 'Northstar Notes', slug: 'northstar-notes' },
            status: terminal ? 'HEALTHY' : 'BUILDING',
            stage: terminal ? 'COMPLETE' : 'BUILDING',
            terminal,
            presentation: terminal
              ? {
                  label: 'Live',
                  tone: 'healthy',
                  hint: 'This release passed its checks and is serving traffic.',
                }
              : {
                  label: 'Building app',
                  tone: 'building',
                  hint: 'Building the application release.',
                },
          },
        ],
        activeDeployments: terminal ? [] : [{ id, status: 'BUILDING', stage: 'BUILDING' }],
        notices: [],
      }),
    });
  });

  await signIn(page);
  const activeList = page.locator('[data-dashboard-active-list]');
  await expect(activeList.getByText('Northstar Notes #8')).toBeVisible();
  await expect(activeList.getByText('Northstar Notes #8')).toBeHidden({ timeout: 12_000 });
  await expect(activeList).toContainText('No deployments are running.');
  await expect(page.locator('[data-dashboard-live]')).toHaveText('Northstar Notes is Live.');
});

test('deployment polling preserves canonical status and refreshes terminal actions', async ({
  page,
}) => {
  let terminalId = '';
  await page.route('**/projects/northstar-notes/deployments', async (route) => {
    if (!terminalId) {
      await route.continue();
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: `<html><body><table><tbody><tr data-deployment-row data-deployment-id="${terminalId}" data-terminal="true"><td data-label="#"><a href="/projects/northstar-notes/deployments/${terminalId}">#8</a></td><td data-label="Status"><span data-deployment-status><span class="status-badge status-badge--failed" tabindex="0" aria-label="Failed: This release did not become live." data-tooltip="This release did not become live.">Failed</span></span><span data-deployment-stage>COMPLETE</span></td><td data-deployment-duration>8s</td><td data-label="Actions"><a href="/projects/northstar-notes/deployments/${terminalId}">Logs</a><form><button type="button">Retry same commit</button></form></td></tr></tbody></table></body></html>`,
    });
  });
  await page.route('**/projects/northstar-notes/deployments/status?*', async (route) => {
    terminalId = new URL(route.request().url()).searchParams.get('ids').split(',')[0];
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        deployments: [
          {
            id: terminalId,
            status: 'FAILED',
            stage: 'COMPLETE',
            durationMs: 8_000,
            terminal: true,
            presentation: {
              label: 'Failed',
              tone: 'failed',
              hint: 'This release did not become live.',
            },
          },
        ],
      }),
    });
  });

  await signIn(page);
  await page.goto('/projects/northstar-notes/deployments');
  const activeRow = page.locator('[data-deployment-row][data-terminal="false"]');
  await expect(activeRow.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect.poll(() => terminalId, { timeout: 7_000 }).not.toBe('');
  const refreshedRow = page.locator(`[data-deployment-row][data-deployment-id="${terminalId}"]`);
  await expect(refreshedRow.getByRole('button', { name: 'Retry same commit' })).toBeVisible();
  const badge = refreshedRow.locator('.status-badge');
  await expect(badge).toHaveText('Failed');
  await expect(badge).toHaveClass(/status-badge--failed/);
  await expect(badge).toHaveAttribute('aria-label', 'Failed: This release did not become live.');
  await expect(refreshedRow.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
});

test('authenticated dark-mode views meet critical accessibility checks', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /dark theme/i }).click();

  for (const path of [
    '/dashboard',
    '/projects/northstar-notes/deployments',
    '/projects/northstar-notes/environment',
  ]) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) => violation.impact === 'critical'),
      `${path} should have no critical axe violations`,
    ).toEqual([]);
  }
});

test('authenticated workflows do not overflow a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await signIn(page);

  for (const path of [
    '/dashboard',
    '/projects/northstar-notes/deployments',
    '/projects/northstar-notes/environment',
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow, `${path} should fit the viewport`).toBeLessThanOrEqual(1);
  }
});

test('stable public visual', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveScreenshot('landing-1440.png', {
    fullPage: true,
    // Font rasterization differs slightly between developer and hosted Linux
    // environments. Layout/dimension changes still fail while antialiasing
    // noise remains portable.
    maxDiffPixelRatio: 0.04,
  });
});

test('stable authenticated dashboard visual', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page).toHaveScreenshot('dashboard-1440.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.04,
  });
});

test('stable deployment failure visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto('/projects/northstar-notes/deployments');
  const failureHref = await page.getByRole('link', { name: '#6' }).getAttribute('href');
  await page.goto(failureHref);
  await expect(page.getByText('Deployment did not go live.')).toBeVisible();
  await expect(page).toHaveScreenshot('deployment-failure-390.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.04,
  });
});
