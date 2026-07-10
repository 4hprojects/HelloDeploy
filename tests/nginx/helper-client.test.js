import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';

const { requestHelper } = await import('../../apps/worker/src/nginx/helper-client.js');

const cleanup = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

async function startHelper(response) {
  const directory = await mkdtemp(join(tmpdir(), 'hellodeploy-nginx-helper-'));
  const socketPath = join(directory, 'helper.sock');
  let received;
  const server = createServer((socket) => {
    let body = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (body += chunk));
    socket.on('end', () => {
      received = JSON.parse(body.trim());
      socket.end(`${JSON.stringify(response)}\n`);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  cleanup.push(
    () => new Promise((resolve) => server.close(resolve)),
    () => rm(directory, { recursive: true, force: true }),
  );
  return { socketPath, received: () => received };
}

describe('Nginx helper client', () => {
  it('sends a newline-delimited local helper request', async () => {
    const helper = await startHelper({ ok: true });
    await requestHelper({ action: 'validate' }, helper.socketPath);
    assert.deepEqual(helper.received(), { action: 'validate' });
  });

  it('propagates a rejected helper operation without exposing a stack', async () => {
    const helper = await startHelper({ ok: false, error: 'nginx validation failed' });
    await assert.rejects(
      () => requestHelper({ action: 'validate' }, helper.socketPath),
      /nginx validation failed/,
    );
  });

  it('reports an unavailable local socket', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hellodeploy-nginx-helper-missing-'));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    await assert.rejects(
      () => requestHelper({ action: 'validate' }, join(directory, 'missing.sock')),
      /Nginx helper unavailable/,
    );
  });
});
