#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'apps', 'web', 'public');
const outputDir = join(publicDir, 'assets-dist');
const manifestPath = join(publicDir, 'asset-manifest.json');
const sources = ['css/main.css', 'js/app.js'];

function stripCssComments(contents) {
  return contents.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

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
    contents = Buffer.from(
      stripCssComments(`${bundled.join('\n')}\n${sourceText.replace(/@import[^;]+;/g, '')}`),
    );
  }
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 16);
  const extension = extname(source);
  const basename = source.split('/').pop().slice(0, -extension.length);
  const outputName = `${basename}.${hash}${extension}`;
  await writeFile(join(outputDir, outputName), contents);
  manifest.assets[source] = `/assets-dist/${outputName}`;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Built ${sources.length} hashed assets.\n`);
