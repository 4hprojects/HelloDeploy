import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';

// Set required env before loading module
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { httpHealthCheck } = await import('../../apps/worker/src/deployment/health-check.js');

// Mock globalThis.fetch for tests
function mockFetch(responses) {
  let call = 0;
  globalThis.fetch = async () => {
    const r = responses[Math.min(call++, responses.length - 1)];
    if (r instanceof Error) {
      throw r;
    }
    return { status: r };
  };
}

function restoreFetch() {
  delete globalThis.fetch;
}

describe('httpHealthCheck', () => {
  after(restoreFetch);

  it('returns healthy=true on first 200 response', async () => {
    mockFetch([200]);
    const result = await httpHealthCheck({
      url: 'http://127.0.0.1:11111/',
      attempts: 3,
      intervalMs: 1,
    });
    assert.equal(result.healthy, true);
    assert.equal(result.finalStatus, 200);
  });

  it('returns healthy=true on 302 redirect', async () => {
    mockFetch([302]);
    const result = await httpHealthCheck({
      url: 'http://127.0.0.1:11111/',
      attempts: 1,
      intervalMs: 1,
    });
    assert.equal(result.healthy, true);
  });

  it('retries on connection error and eventually succeeds', async () => {
    mockFetch([new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), 200]);
    const result = await httpHealthCheck({
      url: 'http://127.0.0.1:11111/',
      attempts: 5,
      intervalMs: 1,
    });
    assert.equal(result.healthy, true);
  });

  it('returns healthy=false when all attempts fail', async () => {
    mockFetch([new Error('ECONNREFUSED')]);
    const result = await httpHealthCheck({
      url: 'http://127.0.0.1:11111/',
      attempts: 3,
      intervalMs: 1,
    });
    assert.equal(result.healthy, false);
    assert.ok(result.error);
  });

  it('returns healthy=false on 500 response throughout', async () => {
    mockFetch([500]);
    const result = await httpHealthCheck({
      url: 'http://127.0.0.1:11111/',
      attempts: 2,
      intervalMs: 1,
    });
    assert.equal(result.healthy, false);
    assert.equal(result.finalStatus, 500);
  });

  it('returns healthy=true for any 2xx status', async () => {
    for (const status of [200, 201, 204]) {
      mockFetch([status]);
      const result = await httpHealthCheck({
        url: 'http://127.0.0.1:11111/',
        attempts: 1,
        intervalMs: 1,
      });
      assert.equal(result.healthy, true, `expected healthy for ${status}`);
    }
  });
});
