#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';

const publicRoot = new URL('../apps/web/public/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', publicRoot), 'utf8'));
const budgets = {
  'css/main.css': 110_000,
  'js/app.js': 65_000,
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
