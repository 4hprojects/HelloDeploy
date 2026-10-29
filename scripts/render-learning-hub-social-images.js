#!/usr/bin/env node

// Renders a 1200×630 social preview image for every published Learning Hub
// article. Run after adding or retitling an article, then commit the PNGs.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { createContentRepository } from '../apps/web/src/services/learning-hub/content-repository.js';

const outputDir = fileURLToPath(new URL('../apps/web/public/assets/blog/social/', import.meta.url));
const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function card({ title, category }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc;
      display: flex; flex-direction: column; justify-content: space-between; padding: 72px 80px; position: relative; overflow: hidden; }
    .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 16px; background: #c8461b; }
    .category { font-size: 28px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #fdba74; }
    h1 { font-size: 64px; line-height: 1.12; font-weight: 800; max-width: 1000px; }
    .brand { font-size: 30px; font-weight: 700; color: #cbd5e1; }
    .brand span { color: #38bdf8; }
  </style></head><body><div class="bar"></div>
    <p class="category">${escapeHtml(category)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="brand">HelloDeploy <span>Learning Hub</span></p>
  </body></html>`;
}

const repository = createContentRepository();
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const article of repository.listPublished()) {
  if (!article.socialImage) {
    continue;
  }
  await page.setContent(
    card({ title: article.title, category: repository.findCategory(article.category).name }),
  );
  const path = fileURLToPath(new URL(`../apps/web/public${article.socialImage}`, import.meta.url));
  await page.screenshot({ path, type: 'png' });
  process.stdout.write(`${article.socialImage}\n`);
}
await browser.close();
