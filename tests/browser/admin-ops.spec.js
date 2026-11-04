import { mkdir } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const EVIDENCE_DIR = process.env.ADMIN_OPS_SCREENSHOT_DIR ?? 'test-results/admin-ops';

// Desktop references from the dashboard specification, plus tablet and phone.
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

// Browser zoom: 1920px at 125% and 150% leaves 1536 and 1280 CSS pixels.
const ZOOMED = [
  { width: 1536, height: 864, deviceScaleFactor: 1.25 },
  { width: 1280, height: 720, deviceScaleFactor: 1.5 },
];

let adminState;

test.beforeAll(async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email Address').fill('admin@hellodeploy.test');
  await page.getByLabel('Password').fill('FixturePass123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  adminState = await context.storageState();
  await context.close();
});

async function adminPage(browser, viewport, theme = 'light') {
  const { deviceScaleFactor, ...size } = viewport;
  const context = await browser.newContext({
    storageState: adminState,
    viewport: size,
    deviceScaleFactor: deviceScaleFactor ?? 1,
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.addInitScript((value) => {
    try {
      globalThis.localStorage.setItem('hd-theme', value);
    } catch {
      // Storage may be unavailable; the colour scheme still applies.
    }
  }, theme);
  return { context, page };
}

function measureLayout(page) {
  return page.evaluate(() => {
    const { document, getComputedStyle } = globalThis;
    const doc = document.documentElement;
    const root = document.querySelector('[data-ops-root]');
    const sidebar = document.querySelector('.sidebar');
    const sidebarWidth =
      sidebar && getComputedStyle(sidebar).position !== 'fixed'
        ? sidebar.getBoundingClientRect().width
        : 0;
    const kpiTops = [...document.querySelectorAll('.ops-kpi')].map((el) =>
      Math.round(el.getBoundingClientRect().top),
    );
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      utilization: root.getBoundingClientRect().width / (doc.clientWidth - sidebarWidth),
      kpisInFirstRow: kpiTops.filter((top) => top === kpiTops[0]).length,
    };
  });
}

for (const viewport of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test(`overview at ${viewport.width}x${viewport.height} (${theme})`, async ({ browser }) => {
      const { context, page } = await adminPage(browser, viewport, theme);
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: 'Admin Operations' })).toBeVisible();
      await page.screenshot({
        path: `${EVIDENCE_DIR}/overview-${viewport.width}x${viewport.height}-${theme}.png`,
        fullPage: true,
      });
      const layout = await measureLayout(page);
      expect(layout.overflow).toBeLessThanOrEqual(0);
      if (viewport.width >= 1366) {
        expect(layout.utilization).toBeGreaterThanOrEqual(0.95);
      }
      if (viewport.width >= 1600) {
        expect(layout.kpisInFirstRow).toBe(6);
      }
      await context.close();
    });
  }
}

for (const viewport of ZOOMED) {
  test(`overview at ${viewport.deviceScaleFactor * 100}% zoom has no page overflow`, async ({
    browser,
  }) => {
    const { context, page } = await adminPage(browser, viewport);
    await page.goto('/admin');
    expect((await measureLayout(page)).overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
}

test('overview and settings pass the accessibility scan in both themes', async ({ browser }) => {
  for (const theme of ['light', 'dark']) {
    const { context, page } = await adminPage(browser, { width: 1920, height: 1080 }, theme);
    for (const path of ['/admin', '/admin/overview/settings']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) =>
          ['critical', 'serious'].includes(violation.impact),
        ),
      ).toEqual([]);
    }
    await context.close();
  }
});

test('manual refresh updates panels in place without reloading the page', async ({ browser }) => {
  const { context, page } = await adminPage(browser, { width: 1920, height: 1080 });
  await page.goto('/admin');
  await page.evaluate(() => {
    globalThis.__opsMarker = 'same-document';
  });
  const live = page.waitForResponse((res) => res.url().includes('/admin/overview/live'));
  await page.getByRole('button', { name: 'Refresh' }).click();
  expect((await live).status()).toBe(200);
  expect(await page.evaluate(() => globalThis.__opsMarker)).toBe('same-document');
  await context.close();
});

test('density and sidebar preferences persist for the administrator', async ({ browser }) => {
  const { context, page } = await adminPage(browser, { width: 1600, height: 900 });
  await page.goto('/admin/overview/settings');
  await page.getByLabel('Spacious').check();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Your dashboard preferences were saved.')).toBeVisible();
  await page.goto('/admin');
  await expect(page.locator('[data-ops-root]')).toHaveClass(/ops--spacious/);

  const saved = page.waitForResponse((res) => res.url().includes('/admin/preferences/sidebar'));
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.locator('.layout')).toHaveClass(/layout--sidebar-collapsed/);
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.locator('.layout')).toHaveClass(/layout--sidebar-collapsed/);
  await page.screenshot({ path: `${EVIDENCE_DIR}/overview-1600x900-collapsed.png` });

  await page.goto('/admin/overview/settings');
  await page.getByRole('button', { name: 'Restore my defaults' }).click();
  await page.goto('/admin');
  await expect(page.locator('[data-ops-root]')).toHaveClass(/ops--compact/);
  await expect(page.locator('.layout')).not.toHaveClass(/layout--sidebar-collapsed/);
  await context.close();
});

test('acknowledging an incident updates the strip in place and keeps it open', async ({
  browser,
}) => {
  const { context, page } = await adminPage(browser, { width: 1920, height: 1080 });
  await page.goto('/admin');
  await page.evaluate(() => {
    globalThis.__opsMarker = 'same-document';
  });
  const strip = page.locator('[data-ops-panel="incidents"]');
  await strip.getByRole('button', { name: 'Acknowledge' }).first().click();
  await expect(strip.getByText(/Acknowledged.*still open/).first()).toBeVisible();
  expect(await page.evaluate(() => globalThis.__opsMarker)).toBe('same-document');
  await context.close();
});

test('longer history ranges read recorded aggregates', async ({ browser }) => {
  const { context, page } = await adminPage(browser, { width: 1600, height: 900 });
  await page.goto('/admin/overview/settings');
  await page.getByLabel('History range').selectOption('24h');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.goto('/admin');
  await expect(page.locator('[data-ops-panel="trends"]')).toContainText('5m averages');
  await page.screenshot({ path: `${EVIDENCE_DIR}/overview-1600x900-24h.png` });
  await page.goto('/admin/overview/settings');
  await page.getByRole('button', { name: 'Restore my defaults' }).click();
  await context.close();
});
