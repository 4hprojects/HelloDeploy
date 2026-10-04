#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const path = new URL('../apps/web/public/asset-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(path, 'utf8'));
for (const key of ['css/main.css', 'js/app.js', 'js/pwa.js']) {
  const value = manifest.assets?.[key];
  if (!/^\/assets-dist\/[a-z0-9.-]+\.[0-9a-f]{16}\.(?:css|js)$/.test(value ?? '')) {
    throw new Error(`Asset manifest entry is invalid or missing: ${key}`);
  }
  const contents = await readFile(new URL(`../apps/web/public${value}`, import.meta.url));
  const expectedHash = value.match(/\.([0-9a-f]{16})\.(?:css|js)$/)?.[1];
  const actualHash = createHash('sha256').update(contents).digest('hex').slice(0, 16);
  if (actualHash !== expectedHash || contents.length === 0) {
    throw new Error(`Asset content does not match its manifest hash: ${key}`);
  }
}
process.stdout.write('Asset manifest and hashed files verified.\n');

const worker = await readFile(
  new URL('../apps/web/public/assets-dist/sw.js', import.meta.url),
  'utf8',
);
const precacheMatch = worker.match(/const PRECACHE = (\{[^\n]+\});/);
if (!precacheMatch) {
  throw new Error('Built service worker is missing its precache configuration.');
}
const precache = JSON.parse(precacheMatch[1]);
if (!/^[a-f0-9]{16}$/.test(precache.version)) {
  throw new Error('Service worker cache version is invalid.');
}
for (const asset of [...Object.values(manifest.assets), '/offline.html']) {
  if (!precache.assets.includes(asset)) {
    throw new Error(`Service worker precache is missing ${asset}.`);
  }
}
for (const asset of precache.assets) {
  if (
    !/^\/(assets-dist\/|assets\/|css\/offline\.css$|js\/offline\.js$|offline\.html$|site\.webmanifest$)/.test(
      asset,
    )
  ) {
    throw new Error(`Unexpected service worker asset: ${asset}.`);
  }
  await readFile(new URL(`../apps/web/public${asset}`, import.meta.url));
}
process.stdout.write('Service worker precache and offline fallback verified.\n');
