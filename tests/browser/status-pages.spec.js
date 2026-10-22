import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// nginx serves these static pages for unknown hostnames (404) and platform
// outages (503); they are checked straight from disk, as nginx sends them.
const pages = {
  'site not found': '../../apps/web/public/site-not-found.html',
  'service unavailable': '../../apps/web/public/service-unavailable.html',
};

for (const [name, path] of Object.entries(pages)) {
  for (const colorScheme of ['light', 'dark']) {
    test(`${name} page has no accessibility violations (${colorScheme})`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto(`file://${fileURLToPath(new URL(path, import.meta.url))}`);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      await context.close();
    });
  }
}

test('site not found page shows the requested hostname', async ({ page }) => {
  await page.route('http://unknown.hellodeploy.test/', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/html',
      path: fileURLToPath(new URL(pages['site not found'], import.meta.url)),
    }),
  );
  await page.goto('http://unknown.hellodeploy.test/');
  await expect(page.locator('#requested-host')).toHaveText('unknown.hellodeploy.test');
});
