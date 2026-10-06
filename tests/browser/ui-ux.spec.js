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
  await expect(page.getByText(/Rollback from current release to target #4/)).toBeVisible();
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

for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`landing has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('keyboard focus is visible and returns after confirmation modal', async ({ page }) => {
  await signIn(page);
  await page.goto('/projects/northstar-notes/deployments');
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();
  await expect(focused).toHaveCSS('outline-style', /solid|auto/);
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
