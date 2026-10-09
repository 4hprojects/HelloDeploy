#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const outputDirectory = new URL('test-results/', root);
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
const profiles = [
  { name: 'mobile', flags: [] },
  { name: 'desktop', flags: ['--preset=desktop'] },
];
const results = {};
let failed = false;

try {
  for (const profile of profiles) {
    const outputPath = new URL(`lighthouse-${profile.name}.json`, outputDirectory).pathname;
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
          ...profile.flags,
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
    if (exitCode !== 0) {
      process.exitCode = exitCode || 1;
      break;
    }

    const report = JSON.parse(await readFile(outputPath, 'utf8'));
    const score = report.categories.performance.score;
    const lcp = report.audits['largest-contentful-paint'].numericValue;
    const cls = report.audits['cumulative-layout-shift'].numericValue;
    const tbt = report.audits['total-blocking-time'].numericValue;
    const total = report.audits['resource-summary'].details.items.find(
      (item) => item.resourceType === 'total',
    );
    results[profile.name] = {
      score,
      lcp,
      cls,
      tbt,
      requests: total.requestCount,
      transferBytes: total.transferSize,
    };
    failed ||= score < 0.7 || lcp > 2_500 || cls > 0.1 || tbt > 300 || total.requestCount > 30;
  }
} finally {
  fixture.kill('SIGTERM');
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (failed) {
  process.stderr.write('Lighthouse lab budget failed. Field Web Vitals remain authoritative.\n');
  process.exitCode = 1;
}
