#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const path = new URL('../apps/web/public/asset-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(path, 'utf8'));
for (const key of ['css/main.css', 'js/app.js']) {
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
