import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const sourceAssets = { 'css/main.css': '/css/main.css', 'js/app.js': '/js/app.js' };

function loadManifest() {
  try {
    const parsed = JSON.parse(readFileSync(join(publicDir, 'asset-manifest.json'), 'utf8'));
    if (!parsed?.assets?.['css/main.css'] || !parsed?.assets?.['js/app.js']) {
      throw new Error('entries missing');
    }
    return parsed.assets;
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Production asset manifest is required: ${error.message}`);
    }
    return sourceAssets;
  }
}

export const assetManifest = loadManifest();
export function assetPath(name) {
  return assetManifest[name] ?? sourceAssets[name] ?? name;
}
