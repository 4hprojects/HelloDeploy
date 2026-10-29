import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  '/legal',
  '/terms',
  '/privacy',
  '/cookies',
  '/acceptable-use',
  '/service-limits',
  '/data-processing',
  '/copyright',
  '/security',
];
const WIDTHS = [320, 1440];

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`${path} has no page-level horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const overflow = await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth -
          globalThis.document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  for (const colorScheme of ['light', 'dark']) {
    test(`${path} has no accessibility violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await page.evaluate(
        (theme) => globalThis.document.documentElement.setAttribute('data-theme', theme),
        colorScheme,
      );
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test('table of contents stays beside the policy on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/privacy');
  const [toc, prose] = await Promise.all([
    page.locator('.legal-toc').boundingBox(),
    page.locator('.legal__prose').boundingBox(),
  ]);
  expect(toc.x + toc.width).toBeLessThanOrEqual(prose.x);
});

test('a table-of-contents link scrolls its heading clear of the sticky header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/privacy');
  await page.locator('.legal-toc a[href="#your-rights"]').click();
  const top = await page.locator('#your-rights').evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(56);
});

test('tables stack into labelled rows on phones', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/privacy');
  const label = await page
    .locator('#retention ~ table td')
    .first()
    .evaluate((el) => globalThis.getComputedStyle(el, '::before').content);
  expect(label).toBe('"Data type"');
});

test('table of contents stays collapsed on phones', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/privacy');
  await expect(page.locator('[data-legal-toc]')).not.toHaveAttribute('open');
});

test('table of contents opens on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/privacy');
  await expect(page.locator('[data-legal-toc]')).toHaveAttribute('open');
});
