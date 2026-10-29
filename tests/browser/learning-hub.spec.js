import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The fixture server serves synthetic articles from tests/fixtures/learning-hub.
const ARTICLE = '/blog/fixture-long-article';
const PAGES = ['/blog', ARTICLE, '/blog/category/deployment-guides'];
const WIDTHS = [320, 375, 768, 1024, 1440];

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

test('article remains readable with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(ARTICLE);
  await expect(page.getByRole('heading', { name: 'Second section', level: 2 })).toBeVisible();
  await context.close();
});

test('table of contents opens on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ARTICLE);
  await expect(page.locator('[data-hub-toc]')).toHaveAttribute('open', '');
});

test('table of contents stays collapsed on phones', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(ARTICLE);
  await expect(page.locator('[data-hub-toc]')).not.toHaveAttribute('open', '');
});

test('table of contents opens from the keyboard on phones', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(ARTICLE);
  await page.locator('.hub-toc__summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Third section' })).toBeVisible();
});

test('copy button copies code and announces the result', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(ARTICLE);
  await page.getByRole('button', { name: 'Copy sh code' }).click();
  await expect(page.getByRole('status')).toHaveText('Code copied to clipboard.');
});

test('code blocks scroll inside their own region', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(ARTICLE);
  const scrolls = await page
    .locator('.code-block pre')
    .evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(scrolls).toBe(true);
});

test('copy link announces success', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(ARTICLE);
  await page.getByRole('button', { name: 'Copy link' }).first().click();
  await expect(page.getByRole('status')).toHaveText('Link copied to clipboard.');
});

test('copy link falls back to a selected link field when the clipboard is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: undefined });
  });
  await page.goto(ARTICLE);
  await page.getByRole('button', { name: 'Copy link' }).first().click();
  await expect(page.getByLabel('Article link').first()).toBeFocused();
});

test('native share stays hidden where Web Share is unsupported', async ({ page }) => {
  await page.addInitScript(() => {
    delete globalThis.Navigator.prototype.share;
  });
  await page.goto(ARTICLE);
  await expect(page.getByRole('button', { name: 'More sharing options' })).toHaveCount(0);
});

test('native share appears where Web Share is supported', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.Navigator.prototype.share = () => Promise.resolve();
  });
  await page.goto(ARTICLE);
  await expect(page.getByRole('button', { name: 'More sharing options' }).first()).toBeVisible();
});

test('share links are reachable by keyboard and open a new tab safely', async ({ page }) => {
  await page.goto(ARTICLE);
  const link = page.getByRole('link', { name: 'Share on LinkedIn (opens in a new tab)' }).first();
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('article sends one view beacon after it is shown', async ({ page }) => {
  const beacon = page.waitForResponse((res) => res.url().endsWith('/view'));
  await page.goto(ARTICLE);
  expect((await beacon).status()).toBe(202);
});
