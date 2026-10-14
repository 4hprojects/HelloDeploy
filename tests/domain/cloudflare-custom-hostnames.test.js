import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createCustomHostnameClient,
  isCustomHostnamesEnabled,
  toCustomHostnameFields,
} from '../../apps/web/src/services/cloudflare-custom-hostnames.js';

const ZONE = 'zone-123';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function recordingFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    return responses.shift();
  };
  return { calls, fetchImpl };
}

describe('Cloudflare custom hostname client', () => {
  it('registers a hostname on the platform zone with an HTTP-validated certificate', async () => {
    const { calls, fetchImpl } = recordingFetch([
      jsonResponse(200, { success: true, result: { id: 'cf-1', hostname: 'app.example.com' } }),
    ]);
    const client = createCustomHostnameClient({ token: 't', zoneId: ZONE, fetchImpl });

    await client.register('app.example.com');

    assert.deepEqual(
      { method: calls[0].method, url: calls[0].url, body: calls[0].body },
      {
        method: 'POST',
        url: `https://api.cloudflare.com/client/v4/zones/${ZONE}/custom_hostnames`,
        body: {
          hostname: 'app.example.com',
          ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
        },
      },
    );
  });

  it('authenticates with the API token', async () => {
    const { calls, fetchImpl } = recordingFetch([
      jsonResponse(200, { success: true, result: { id: 'cf-1' } }),
    ]);
    const client = createCustomHostnameClient({ token: 'secret-token', zoneId: ZONE, fetchImpl });

    await client.get('cf-1');

    assert.equal(calls[0].headers.Authorization, 'Bearer secret-token');
  });

  it('reuses a hostname Cloudflare already has instead of failing', async () => {
    const { fetchImpl } = recordingFetch([
      jsonResponse(409, { success: false, errors: [{ code: 1406, message: 'Duplicate' }] }),
      jsonResponse(200, {
        success: true,
        result: [{ id: 'cf-existing', hostname: 'app.example.com' }],
      }),
    ]);
    const client = createCustomHostnameClient({ token: 't', zoneId: ZONE, fetchImpl });

    const result = await client.register('app.example.com');

    assert.equal(result.result.id, 'cf-existing');
  });

  it('returns Cloudflare errors as values', async () => {
    const { fetchImpl } = recordingFetch([
      jsonResponse(403, {
        success: false,
        errors: [{ code: 10000, message: 'Authentication error' }],
      }),
    ]);
    const client = createCustomHostnameClient({ token: 't', zoneId: ZONE, fetchImpl });

    assert.deepEqual(await client.remove('cf-1'), {
      ok: false,
      code: 10000,
      error: 'Authentication error',
    });
  });

  it('reports a timeout without throwing', async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    const client = createCustomHostnameClient({ token: 't', zoneId: ZONE, fetchImpl });

    assert.equal((await client.get('cf-1')).error, 'Cloudflare API timed out');
  });
});

describe('custom hostname helpers', () => {
  it('is enabled only when token, zone, and target are all set', () => {
    assert.equal(
      isCustomHostnamesEnabled({ CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ZONE_ID: 'z' }),
      false,
    );
  });

  it('keeps the ownership record only while the hostname is pending', () => {
    const fields = toCustomHostnameFields({
      id: 'cf-1',
      status: 'active',
      ssl: { status: 'active' },
      ownership_verification: { type: 'txt', name: '_cf.example.com', value: 'v' },
    });
    assert.deepEqual(fields.cfValidationRecords, []);
  });
});
