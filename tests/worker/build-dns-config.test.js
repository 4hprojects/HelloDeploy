import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// A query string loads a fresh copy of the config module for each environment.
const WORKER_ENV = '../../apps/worker/src/config/env.js';

describe('BUILD_DNS_SERVERS', () => {
  it('parses a comma-separated list of resolver addresses', async () => {
    process.env.BUILD_DNS_SERVERS = ' 192.168.100.1, 1.1.1.1 ,2606:4700:4700::1111';
    const { env } = await import(`${WORKER_ENV}?dns-valid`);
    assert.deepEqual(env.BUILD_DNS_SERVERS, ['192.168.100.1', '1.1.1.1', '2606:4700:4700::1111']);
  });

  it('rejects a value that is not an IP address', async () => {
    process.env.BUILD_DNS_SERVERS = '1.1.1.1,dns.example.com';
    await assert.rejects(import(`${WORKER_ENV}?dns-invalid`), {
      message: 'BUILD_DNS_SERVERS must be a comma-separated list of IP addresses.',
    });
  });
});
