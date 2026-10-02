#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const productDir = new URL('apps/web/public/assets/product/', root);
const socialDir = new URL('apps/web/public/assets/social/', root);
await Promise.all([mkdir(productDir, { recursive: true }), mkdir(socialDir, { recursive: true })]);

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

const browser = await chromium.launch({ headless: true });
try {
  const dashboard = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await dashboard.goto('http://127.0.0.1:4173/auth/sign-in');
  await dashboard.getByLabel('Email Address').fill('demo@hellodeploy.test');
  await dashboard.getByLabel('Password').fill('FixturePass123!');
  await dashboard.getByRole('button', { name: 'Sign In' }).click();
  await dashboard.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await dashboard.screenshot({
    path: new URL('dashboard-preview.png', productDir).pathname,
    animations: 'disabled',
  });

  const social = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await social.goto('http://127.0.0.1:4173');
  await social.screenshot({
    path: new URL('hellodeploy-og-image.png', socialDir).pathname,
    animations: 'disabled',
  });
} finally {
  await browser.close();
  fixture.kill('SIGTERM');
}

process.stdout.write('Captured sanitized product and social previews from the real application.\n');
