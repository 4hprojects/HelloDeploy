#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'apps', 'web', 'public');
const outputDir = join(publicDir, 'assets-dist');
const manifestPath = join(publicDir, 'asset-manifest.json');
const sources = ['css/main.css', 'js/app.js', 'js/pwa.js'];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const manifest = { schemaVersion: 1, assets: {} };

for (const source of sources) {
  const sourcePath = join(publicDir, source);
  let contents = await readFile(sourcePath);
  if (source === 'css/main.css') {
    const sourceText = contents.toString('utf8');
    const imports = [...sourceText.matchAll(/@import\s+['"]\.\/([^'"]+)['"];?/g)];
    const bundled = [];
    for (const match of imports) {
      bundled.push(await readFile(join(dirname(sourcePath), match[1]), 'utf8'));
    }
    contents = Buffer.from(`${bundled.join('\n')}\n${sourceText.replace(/@import[^;]+;/g, '')}`);
  }
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 16);
  const extension = extname(source);
  const basename = source.split('/').pop().slice(0, -extension.length);
  const outputName = `${basename}.${hash}${extension}`;
  await writeFile(join(outputDir, outputName), contents);
  manifest.assets[source] = `/assets-dist/${outputName}`;
}

// Generate the worker from the exact bytes deployed with this asset build.
const staticPaths = [
  '/offline.html',
  '/css/offline.css',
  '/js/offline.js',
  '/site.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-maskable.svg',
  '/assets/brand/mark.png',
];
const workerTemplate = await readFile(join(root, 'apps/web/src/pwa/service-worker.js'), 'utf8');
const versionHash = createHash('sha256').update(workerTemplate);
for (const path of [...Object.values(manifest.assets), ...staticPaths]) {
  versionHash.update(path).update(await readFile(join(publicDir, path)));
}
const precache = {
  version: versionHash.digest('hex').slice(0, 16),
  assets: [...Object.values(manifest.assets), ...staticPaths],
};
await writeFile(
  join(outputDir, 'sw.js'),
  workerTemplate.replace('/* PRECACHE_CONFIG */ null', JSON.stringify(precache)),
);

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Built ${sources.length} hashed assets.\n`);
