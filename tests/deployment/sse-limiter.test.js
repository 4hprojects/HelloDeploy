import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { acquireStreamSlot, releaseStreamSlot } =
  await import('../../apps/web/src/services/sse-limiter.js');

/** Minimal ioredis stand-in: INCR/DECR/EXPIRE/DEL over a Map. */
function makeFakeRedis() {
  const store = new Map();
  return {
    status: 'ready',
    store,
    async incr(key) {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    },
    async decr(key) {
      const next = (store.get(key) ?? 0) - 1;
      store.set(key, next);
      return next;
    },
    async expire() {},
    async del(key) {
      store.delete(key);
    },
  };
}

describe('sse-limiter — redis-backed slots', () => {
  it('grants slots up to the limit and rejects beyond it', async () => {
    const redis = makeFakeRedis();
    const deps = { getRedisConnection: () => redis };
    assert.equal(await acquireStreamSlot('sse:user:u1', 2, deps), true);
    assert.equal(await acquireStreamSlot('sse:user:u1', 2, deps), true);
    assert.equal(await acquireStreamSlot('sse:user:u1', 2, deps), false);
  });

  it('does not count a rejected acquire against the limit', async () => {
    const redis = makeFakeRedis();
    const deps = { getRedisConnection: () => redis };
    await acquireStreamSlot('sse:user:u2', 1, deps);
    await acquireStreamSlot('sse:user:u2', 1, deps); // rejected, must roll back its INCR
    assert.equal(redis.store.get('sse:user:u2'), 1);
  });

  it('release frees a slot for the next acquire', async () => {
    const redis = makeFakeRedis();
    const deps = { getRedisConnection: () => redis };
    await acquireStreamSlot('sse:user:u3', 1, deps);
    await releaseStreamSlot('sse:user:u3', deps);
    assert.equal(await acquireStreamSlot('sse:user:u3', 1, deps), true);
  });

  it('deletes the key when the last slot is released', async () => {
    const redis = makeFakeRedis();
    const deps = { getRedisConnection: () => redis };
    await acquireStreamSlot('sse:user:u4', 3, deps);
    await releaseStreamSlot('sse:user:u4', deps);
    assert.equal(redis.store.has('sse:user:u4'), false);
  });
});

describe('sse-limiter — in-memory fallback', () => {
  const noRedis = { getRedisConnection: () => null };

  it('still enforces the limit per process without Redis', async () => {
    assert.equal(await acquireStreamSlot('sse:user:mem1', 1, noRedis), true);
    assert.equal(await acquireStreamSlot('sse:user:mem1', 1, noRedis), false);
    await releaseStreamSlot('sse:user:mem1', noRedis);
    assert.equal(await acquireStreamSlot('sse:user:mem1', 1, noRedis), true);
    await releaseStreamSlot('sse:user:mem1', noRedis);
  });

  it('falls back to memory when the Redis client is not ready', async () => {
    const notReady = {
      status: 'connecting',
      async incr() {
        throw new Error('must not be called');
      },
    };
    const deps = { getRedisConnection: () => notReady };
    assert.equal(await acquireStreamSlot('sse:user:mem2', 1, deps), true);
    await releaseStreamSlot('sse:user:mem2', deps);
  });

  it('falls back to memory when a Redis command rejects', async () => {
    const broken = {
      status: 'ready',
      async incr() {
        throw new Error('connection reset');
      },
    };
    const deps = { getRedisConnection: () => broken };
    assert.equal(await acquireStreamSlot('sse:user:mem3', 1, deps), true);
    assert.equal(await acquireStreamSlot('sse:user:mem3', 1, deps), false);
  });
});
