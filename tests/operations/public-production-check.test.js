import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkPublicProduction } from '../../scripts/check-public-production.js';

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers,
  });
}

const EXPECTED_ASSETS = ['/js/app.js?v=test-release', '/css/main.css?v=test-release'];

function productionFetch({ cookie = 'Secure; HttpOnly; SameSite=Strict', ready = true } = {}) {
  return async (url) => {
    switch (new URL(url).pathname) {
      case '/':
        return new Response(
          `<script src="${EXPECTED_ASSETS[0]}"></script><link href="${EXPECTED_ASSETS[1]}">`,
          {
            status: 200,
            headers: {
              'content-security-policy': "default-src 'self'",
              'strict-transport-security': 'max-age=31536000',
              'set-cookie': `hellodeploy.sid=sensitive-test-value; Path=/; ${cookie}`,
            },
          },
        );
      case '/auth/sign-in':
        return response(null, { headers: { 'content-type': 'text/html' } });
      case '/health':
        return response({ status: 'ok', service: 'web', timestamp: '2026-07-13T00:00:00Z' });
      case '/ready':
        return response({
          status: ready ? 'ready' : 'not_ready',
          service: 'web',
          checks: { mongodb: ready, redis: ready, queue: ready },
        });
      default:
        return response(null, { status: 404 });
    }
  };
}

describe('public production check', () => {
  it('passes the complete public security and readiness contract', async () => {
    const checks = await checkPublicProduction('https://hellodeploy.test', productionFetch(), {
      expectedAssets: EXPECTED_ASSETS,
    });
    assert.equal(
      checks.every((check) => check.ok),
      true,
    );
    assert.doesNotMatch(JSON.stringify(checks), /sensitive-test-value/);
  });

  it('reports a missing Secure attribute without exposing the cookie value', async () => {
    const checks = await checkPublicProduction(
      'https://hellodeploy.test',
      productionFetch({ cookie: 'HttpOnly; SameSite=Strict' }),
      { expectedAssets: EXPECTED_ASSETS },
    );
    const cookieCheck = checks.find((check) => check.name === 'session-cookie');
    assert.deepEqual(cookieCheck, {
      name: 'session-cookie',
      ok: false,
      detail: 'missing secure',
    });
    assert.doesNotMatch(JSON.stringify(checks), /sensitive-test-value/);
  });

  it('rejects non-HTTPS targets and unsanitized readiness responses', async () => {
    await assert.rejects(
      checkPublicProduction('http://hellodeploy.test', productionFetch()),
      /HTTPS URL/,
    );

    const fetchWithExtraReadinessData = async (url, options) => {
      if (new URL(url).pathname === '/ready') {
        return response({
          status: 'ready',
          service: 'web',
          checks: { mongodb: true, redis: true, queue: true, topology: 'must-not-leak' },
        });
      }
      return productionFetch()(url, options);
    };
    const checks = await checkPublicProduction(
      'https://hellodeploy.test',
      fetchWithExtraReadinessData,
      { expectedAssets: EXPECTED_ASSETS },
    );
    assert.equal(checks.find((check) => check.name === 'readiness').ok, false);
    assert.doesNotMatch(JSON.stringify(checks), /must-not-leak/);
  });

  it('fails when the live frontend does not match the checkout asset identifiers', async () => {
    const checks = await checkPublicProduction('https://hellodeploy.test', productionFetch(), {
      expectedAssets: ['/js/app.js?v=new-release'],
    });
    assert.deepEqual(
      checks.find((check) => check.name === 'frontend-release'),
      {
        name: 'frontend-release',
        ok: false,
        detail: '1 expected asset(s) missing',
      },
    );
  });
});
