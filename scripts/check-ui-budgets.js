#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';

const publicRoot = new URL('../apps/web/public/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', publicRoot), 'utf8'));
const budgets = {
  'css/main.css': 110_000,
  // Raised from 65 KB for the .env import review table (#79), then from 70 KB
  // for the confirm modal's reason field; unminified bytes.
  'js/app.js': 72_000,
  // Loaded only on /blog pages.
  'css/learning-hub.css': 20_000,
  'js/learning-hub.js': 10_000,
  // Loaded only on the policy pages.
  'css/legal.css': 10_000,
};

let failed = false;
for (const [source, limit] of Object.entries(budgets)) {
  const asset = manifest.assets?.[source];
  if (!asset) {
    throw new Error(`Missing manifest entry for ${source}.`);
  }
  const { size } = await stat(new URL(`.${asset}`, publicRoot));
  process.stdout.write(`${source}: ${size} bytes (budget ${limit})\n`);
  if (size > limit) {
    failed = true;
  }
}

if (failed) {
  process.stderr.write('One or more production assets exceed their explicit byte budget.\n');
  process.exit(1);
}
