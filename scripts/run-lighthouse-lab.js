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
// One lab run varies by a few percent on shared CI runners, enough to cross a
// budget the page meets; Lighthouse recommends judging the median of several.
const RUNS_PER_PROFILE = 3;
// Lighthouse occasionally fails to record a trace (NO_NAVSTART) and measures
// nothing. Such a run is replaced; it never counts toward or against a budget.
const MAX_CRASHED_RUNS = 2;
const results = {};
let failed = false;

try {
  for (const profile of profiles) {
    const runs = [];
    let crashedRuns = 0;
    for (let run = 1; runs.length < RUNS_PER_PROFILE; run += 1) {
      const outputPath = new URL(`lighthouse-${profile.name}-${run}.json`, outputDirectory)
        .pathname;
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
        crashedRuns += 1;
        process.stderr.write(`Lighthouse ${profile.name} run ${run} produced no measurement.\n`);
        if (crashedRuns > MAX_CRASHED_RUNS) {
          process.exitCode = exitCode || 1;
          failed = true;
          break;
        }
        continue;
      }
      runs.push(toMetrics(JSON.parse(await readFile(outputPath, 'utf8'))));
    }
    if (runs.length < RUNS_PER_PROFILE) {
      break;
    }
    const median = Object.fromEntries(
      Object.keys(runs[0]).map((key) => [key, medianOf(runs.map((metrics) => metrics[key]))]),
    );
    results[profile.name] = median;
    failed ||=
      median.score < 0.7 ||
      median.lcp > 2_500 ||
      median.cls > 0.1 ||
      median.tbt > 300 ||
      median.requests > 30;
  }
} finally {
  fixture.kill('SIGTERM');
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (failed) {
  process.stderr.write('Lighthouse lab budget failed. Field Web Vitals remain authoritative.\n');
  process.exitCode = 1;
}

function toMetrics(report) {
  const total = report.audits['resource-summary'].details.items.find(
    (item) => item.resourceType === 'total',
  );
  return {
    score: report.categories.performance.score,
    lcp: report.audits['largest-contentful-paint'].numericValue,
    cls: report.audits['cumulative-layout-shift'].numericValue,
    tbt: report.audits['total-blocking-time'].numericValue,
    requests: total.requestCount,
    transferBytes: total.transferSize,
  };
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
