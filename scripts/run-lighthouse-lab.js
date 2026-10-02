#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const outputDirectory = new URL('test-results/', root);
const outputPath = new URL('lighthouse.json', outputDirectory).pathname;
await mkdir(outputDirectory, { recursive: true });

const fixture = spawn(process.execPath, ['scripts/browser-fixture-server.js'], {
  cwd: root,
  env: { ...process.env, PORT: '4173' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error('Browser fixture did not become ready.')),
    120_000,
  );
  fixture.once('error', reject);
  fixture.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('Browser fixture listening')) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const lighthousePath = join(new URL('node_modules/.bin/', root).pathname, 'lighthouse');
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(
    lighthousePath,
    [
      'http://127.0.0.1:4173/',
      '--quiet',
      '--output=json',
      `--output-path=${outputPath}`,
      '--chrome-flags=--headless --no-sandbox',
      '--only-categories=performance',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CHROME_PATH: chromium.executablePath() },
    },
  );
  child.once('error', reject);
  child.once('close', resolve);
});
fixture.kill('SIGTERM');
if (exitCode !== 0) {
  process.exit(exitCode || 1);
}

const report = JSON.parse(await readFile(outputPath, 'utf8'));
const score = report.categories.performance.score;
const lcp = report.audits['largest-contentful-paint'].numericValue;
const cls = report.audits['cumulative-layout-shift'].numericValue;
const tbt = report.audits['total-blocking-time'].numericValue;
const total = report.audits['resource-summary'].details.items.find(
  (item) => item.resourceType === 'total',
);
const results = {
  score,
  lcp,
  cls,
  tbt,
  requests: total.requestCount,
  transferBytes: total.transferSize,
};
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

const failed = score < 0.7 || lcp > 3_000 || cls > 0.1 || tbt > 300 || total.requestCount > 30;
if (failed) {
  process.stderr.write('Lighthouse lab budget failed. Field Web Vitals remain authoritative.\n');
  process.exit(1);
}
