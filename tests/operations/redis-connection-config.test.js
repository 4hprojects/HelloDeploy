import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { classifyRedisError, resolveRedisConnectionConfig } from '@hellodeploy/queue';

describe('Redis connection configuration', () => {
  it('prefers a managed TLS URL without returning parsed credentials', () => {
    const url = 'rediss://user:sensitive-password@managed.example.test:6380/0';
    const result = resolveRedisConnectionConfig({
      url,
      host: 'ignored.example.test',
      port: 1234,
      password: 'ignored-password',
      production: true,
    });

    assert.deepEqual(result, {
      mode: 'managed-tls-url',
      connection: { url },
    });
    assert.equal('host' in result.connection, false);
    assert.equal('password' in result.connection, false);
  });

  it('retains legacy loopback host configuration', () => {
    assert.deepEqual(
      resolveRedisConnectionConfig({
        host: '127.0.0.1',
        port: 6379,
        password: 'local-password',
        production: true,
      }),
      {
        mode: 'local-split',
        connection: { host: '127.0.0.1', port: 6379, password: 'local-password' },
      },
    );
  });

  it('rejects insecure remote production URLs without reflecting them', () => {
    const url = 'redis://user:sensitive-password@managed.example.test:6379/0';
    assert.throws(
      () => resolveRedisConnectionConfig({ url, production: true }),
      (error) => {
        assert.match(error.message, /requires a rediss:\/\//);
        assert.doesNotMatch(error.message, /sensitive-password|managed\.example/);
        return true;
      },
    );
  });

  it('rejects remote legacy host configuration in production', () => {
    assert.throws(
      () =>
        resolveRedisConnectionConfig({
          host: 'managed.example.test',
          port: 6379,
          password: 'sensitive-password',
          production: true,
        }),
      /requires REDIS_URL with rediss:\/\//,
    );
  });

  it('permits explicit non-production remote configuration for compatibility', () => {
    assert.equal(
      resolveRedisConnectionConfig({ host: 'dev.example.test', production: false }).mode,
      'remote-split',
    );
  });

  it('reduces connection failures to bounded classifications', () => {
    assert.equal(classifyRedisError({ code: 'ECONNREFUSED' }), 'ECONNREFUSED');
    assert.equal(
      classifyRedisError(new Error('redis://user:sensitive-password@private.example.test:6379')),
      'REDIS_ERROR',
    );
  });

  it('keeps Redis endpoints and raw connection errors out of service logs', async () => {
    const files = [
      '../../apps/web/src/queue/client.js',
      '../../apps/web/src/middleware/rate-limit.js',
      '../../apps/web/src/services/deploy-log-stream.js',
      '../../apps/worker/src/runtime.js',
    ];
    const sources = await Promise.all(
      files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
    );
    for (const [index, source] of sources.entries()) {
      assert.doesNotMatch(source, /REDIS_HOST.*REDIS_PORT/);
      assert.match(source, /classifyRedisError/);
      if (index < sources.length - 1) {
        assert.doesNotMatch(source, /err\.message/);
      }
    }
  });
});
