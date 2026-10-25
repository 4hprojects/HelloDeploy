import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import http from 'node:http';
import { describe, it, afterEach } from 'node:test';

// Set required env before loading module
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { httpHealthCheck } = await import('../../apps/worker/src/deployment/health-check.js');

let server;

// Each entry answers one request: a status code, 'drop' to destroy the socket,
// or 'hang' to never respond. The last entry repeats.
async function startServer(replies, headers = {}, body = '') {
  let call = 0;
  server = http.createServer((req, res) => {
    const reply = replies[Math.min(call++, replies.length - 1)];
    if (reply === 'drop') {
      req.socket.destroy();
      return;
    }
    if (reply === 'hang') {
      return;
    }
    res.writeHead(reply, headers);
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}/`;
}

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('httpHealthCheck', () => {
  it('returns healthy=true on first 200 response', async () => {
    const url = await startServer([200]);
    const result = await httpHealthCheck({ url, attempts: 3, intervalMs: 1 });
    assert.deepEqual(result, { healthy: true, finalStatus: 200 });
  });

  it('returns healthy=true on 302 redirect without following it', async () => {
    const url = await startServer([302], { Location: 'http://127.0.0.1:1/' });
    const result = await httpHealthCheck({ url, attempts: 1, intervalMs: 1 });
    assert.deepEqual(result, { healthy: true, finalStatus: 302 });
  });

  it('returns healthy=true for a 204 response', async () => {
    const url = await startServer([204]);
    const result = await httpHealthCheck({ url, attempts: 1, intervalMs: 1 });
    assert.deepEqual(result, { healthy: true, finalStatus: 204 });
  });

  it('retries on connection error and eventually succeeds', async () => {
    const url = await startServer(['drop', 'drop', 200]);
    const result = await httpHealthCheck({ url, attempts: 5, intervalMs: 1 });
    assert.deepEqual(result, { healthy: true, finalStatus: 200 });
  });

  it('returns healthy=false when all attempts fail', async () => {
    const url = await startServer(['drop']);
    const result = await httpHealthCheck({ url, attempts: 3, intervalMs: 1 });
    assert.deepEqual(result, { healthy: false, finalStatus: undefined, error: 'socket hang up' });
  });

  it('returns healthy=false on 500 response throughout', async () => {
    const url = await startServer([500]);
    const result = await httpHealthCheck({ url, attempts: 2, intervalMs: 1 });
    assert.deepEqual(result, { healthy: false, finalStatus: 500, error: 'HTTP 500' });
  });

  it('reports a timeout when the app never answers', async () => {
    const url = await startServer(['hang']);
    const result = await httpHealthCheck({ url, attempts: 1, intervalMs: 1, timeoutMs: 50 });
    assert.deepEqual(result, {
      healthy: false,
      finalStatus: undefined,
      error: 'Timeout after 50ms',
    });
  });

  it('never decompresses a br-encoded response from the app', async () => {
    const url = await startServer(
      [200],
      { 'Content-Encoding': 'br' },
      Buffer.from('not a valid brotli stream'),
    );
    let zlibHandles = 0;
    const hook = createHook({
      init(_id, type) {
        if (type === 'ZLIB') {
          zlibHandles++;
        }
      },
    }).enable();
    await httpHealthCheck({ url, attempts: 1, intervalMs: 1 });
    hook.disable();
    assert.equal(zlibHandles, 0);
  });
});
