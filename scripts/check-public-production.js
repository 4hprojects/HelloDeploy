#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const REQUIRED_COOKIE_ATTRIBUTES = ['secure', 'httponly', 'samesite=strict'];
const ALLOWED_HEALTH_KEYS = ['commit', 'service', 'status', 'timestamp'];
const ALLOWED_READY_KEYS = ['checks', 'service', 'status'];
const REQUIRED_READY_CHECKS = ['mongodb', 'queue', 'redis'];

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function sessionCookieAttributes(headers) {
  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);

  for (const header of setCookies) {
    const segments = header.split(';');
    const separator = segments[0].indexOf('=');
    const name = separator >= 0 ? segments[0].slice(0, separator).trim() : '';
    if (name === 'hellodeploy.sid') {
      return new Set(segments.slice(1).map((segment) => segment.trim().toLowerCase()));
    }
  }
  return null;
}

export async function readExpectedPublicAssets() {
  try {
    const manifest = JSON.parse(
      await readFile(new URL('../apps/web/public/asset-manifest.json', import.meta.url), 'utf8'),
    );
    const assets = Object.values(manifest.assets ?? {}).filter(
      (value) => typeof value === 'string' && value.startsWith('/assets-dist/'),
    );
    if (assets.length > 0) {
      return assets;
    }
  } catch {
    // Development checkouts may intentionally use source assets.
  }
  const files = [
    new URL('../apps/web/src/views/layouts/main.ejs', import.meta.url),
    new URL('../apps/web/src/views/partials/head.ejs', import.meta.url),
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const assets = sources.flatMap((source) =>
    [...source.matchAll(/["'](\/(?:css|js)\/[^"']+)["']/g)].map((match) => match[1]),
  );
  return [...new Set(assets)];
}

export async function checkPublicProduction(
  baseUrl,
  fetchImpl = fetch,
  { expectedAssets = [], expectedSha = null } = {},
) {
  const parsedBase = new URL(baseUrl);
  if (parsedBase.protocol !== 'https:') {
    throw new Error('Production checks require an HTTPS URL.');
  }

  const request = async (pathname) =>
    fetchImpl(new URL(pathname, parsedBase), {
      redirect: 'error',
      headers: { accept: pathname === '/' ? 'text/html' : 'application/json' },
    });

  const checks = [];
  const homepage = await request('/');
  const homepageBody = await homepage.text();
  checks.push({ name: 'homepage', ok: homepage.status === 200, detail: `HTTP ${homepage.status}` });
  checks.push({
    name: 'public-page-markers',
    ok:
      homepageBody.includes('<h1') &&
      homepageBody.includes('rel="canonical"') &&
      homepageBody.includes('property="og:title"'),
    detail: 'H1, canonical, and social metadata',
  });
  if (expectedAssets.length > 0) {
    const missingAssets = expectedAssets.filter((asset) => !homepageBody.includes(asset));
    checks.push({
      name: 'frontend-release',
      ok: missingAssets.length === 0,
      detail:
        missingAssets.length === 0
          ? 'expected assets present'
          : `${missingAssets.length} expected asset(s) missing`,
    });
    const assetResponses = await Promise.all(expectedAssets.map((asset) => request(asset)));
    checks.push({
      name: 'frontend-assets',
      ok: assetResponses.every((response) => response.status === 200),
      detail: `${assetResponses.filter((response) => response.status === 200).length}/${assetResponses.length} available`,
    });
  }
  checks.push({
    name: 'hsts',
    ok: Boolean(homepage.headers.get('strict-transport-security')),
    detail: homepage.headers.get('strict-transport-security') ? 'present' : 'missing',
  });
  checks.push({
    name: 'csp',
    ok: Boolean(homepage.headers.get('content-security-policy')),
    detail: homepage.headers.get('content-security-policy') ? 'present' : 'missing',
  });

  const cookieAttributes = sessionCookieAttributes(homepage.headers);
  const missingCookieAttributes = cookieAttributes
    ? REQUIRED_COOKIE_ATTRIBUTES.filter((attribute) => !cookieAttributes.has(attribute))
    : REQUIRED_COOKIE_ATTRIBUTES;
  checks.push({
    name: 'session-cookie',
    ok: Boolean(cookieAttributes) && missingCookieAttributes.length === 0,
    detail: cookieAttributes
      ? missingCookieAttributes.length === 0
        ? 'required attributes present'
        : `missing ${missingCookieAttributes.join(', ')}`
      : 'session cookie missing',
  });

  const signIn = await request('/auth/sign-in');
  checks.push({
    name: 'sign-in',
    ok: signIn.status === 200,
    detail: `HTTP ${signIn.status}`,
  });

  const health = await request('/health');
  let healthBody = null;
  try {
    healthBody = await health.json();
  } catch {
    // Report a bounded failure below; never echo a response body.
  }
  checks.push({
    name: 'health',
    ok:
      health.status === 200 &&
      exactKeys(healthBody, ALLOWED_HEALTH_KEYS) &&
      healthBody.status === 'ok' &&
      healthBody.service === 'web' &&
      /^[0-9a-f]{40}$/.test(healthBody.commit ?? '') &&
      (!expectedSha || healthBody.commit === expectedSha),
    detail:
      health.status === 200
        ? expectedSha
          ? healthBody?.commit === expectedSha
            ? 'expected release SHA'
            : 'release SHA mismatch'
          : 'sanitized response with release SHA'
        : `HTTP ${health.status}`,
  });

  const ready = await request('/ready');
  let readyBody = null;
  try {
    readyBody = await ready.json();
  } catch {
    // Report a bounded failure below; never echo a response body.
  }
  const readyChecks = readyBody?.checks;
  const readinessSanitized =
    exactKeys(readyBody, ALLOWED_READY_KEYS) &&
    exactKeys(readyChecks, REQUIRED_READY_CHECKS) &&
    REQUIRED_READY_CHECKS.every((name) => readyChecks[name] === true);
  checks.push({
    name: 'readiness',
    ok:
      ready.status === 200 &&
      readyBody?.status === 'ready' &&
      readyBody?.service === 'web' &&
      readinessSanitized,
    detail: ready.status === 200 ? 'sanitized dependencies ready' : `HTTP ${ready.status}`,
  });

  for (const pathname of ['/robots.txt', '/sitemap.xml']) {
    const response = await request(pathname);
    const body = await response.text();
    checks.push({
      name: pathname.slice(1).replace('.', '-'),
      ok:
        response.status === 200 &&
        (pathname === '/robots.txt'
          ? body.includes('Sitemap:') && body.includes('Disallow: /admin')
          : body.includes('<urlset') && body.includes('<loc>')),
      detail: `HTTP ${response.status}`,
    });
  }

  return checks;
}

async function main() {
  const cli = process.argv.slice(2);
  const expectedIndex = cli.indexOf('--expected-sha');
  const expectedSha =
    (expectedIndex >= 0 ? cli[expectedIndex + 1] : null) ??
    process.env.HELLODEPLOY_EXPECTED_RELEASE_COMMIT ??
    null;
  const baseUrl =
    cli.find((value, index) => !value.startsWith('--') && index !== expectedIndex + 1) ??
    process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    process.stderr.write(
      'Usage: npm run production:check -- https://your-domain.example --expected-sha <full-sha>\n',
    );
    process.exitCode = 2;
    return;
  }

  try {
    if (expectedSha && !/^[0-9a-f]{40}$/.test(expectedSha)) {
      throw new Error('Expected SHA must be a full lowercase 40-character commit SHA.');
    }
    const expectedAssets = await readExpectedPublicAssets();
    const checks = await checkPublicProduction(baseUrl, fetch, { expectedAssets, expectedSha });
    for (const check of checks) {
      process.stdout.write(`[${check.ok ? 'pass' : 'fail'}] ${check.name}: ${check.detail}\n`);
    }
    process.exitCode = checks.every((check) => check.ok) ? 0 : 1;
  } catch (error) {
    process.stderr.write(`[fail] public production check: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
