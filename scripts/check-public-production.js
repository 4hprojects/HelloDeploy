#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const REQUIRED_COOKIE_ATTRIBUTES = ['secure', 'httponly', 'samesite=strict'];
const ALLOWED_HEALTH_KEYS = ['service', 'status', 'timestamp'];
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
  const files = [
    new URL('../apps/web/src/views/layouts/main.ejs', import.meta.url),
    new URL('../apps/web/src/views/partials/head.ejs', import.meta.url),
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const assets = sources.flatMap((source) =>
    [...source.matchAll(/["'](\/[^"']+\?v=[^"']+)["']/g)].map((match) => match[1]),
  );
  return [...new Set(assets)];
}

export async function checkPublicProduction(
  baseUrl,
  fetchImpl = fetch,
  { expectedAssets = [] } = {},
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
      healthBody.service === 'web',
    detail: health.status === 200 ? 'sanitized response' : `HTTP ${health.status}`,
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

  return checks;
}

async function main() {
  const baseUrl = process.argv[2] ?? process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    process.stderr.write('Usage: npm run production:check -- https://your-domain.example\n');
    process.exitCode = 2;
    return;
  }

  try {
    const expectedAssets = await readExpectedPublicAssets();
    const checks = await checkPublicProduction(baseUrl, fetch, { expectedAssets });
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
