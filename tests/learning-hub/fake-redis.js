/** Minimal Redis double for SET NX EX, GET, DEL, and INCR/EXPIRE, with a controllable clock. */
export function createFakeRedis({ now = () => Date.now() } = {}) {
  const store = new Map();
  const live = (key) => {
    const entry = store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now()) {
      store.delete(key);
      return null;
    }
    return entry ?? null;
  };
  return {
    status: 'ready',
    store,
    async set(key, value, ...args) {
      const exIndex = args.indexOf('EX');
      const ttl = exIndex >= 0 ? Number(args[exIndex + 1]) : null;
      if (args.includes('NX') && live(key)) {
        return null;
      }
      store.set(key, { value, expiresAt: ttl === null ? null : now() + ttl * 1000 });
      return 'OK';
    },
    async get(key) {
      return live(key)?.value ?? null;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async incr(key) {
      const entry = live(key);
      const value = Number(entry?.value ?? 0) + 1;
      store.set(key, { value: String(value), expiresAt: entry?.expiresAt ?? null });
      return value;
    },
    async expire(key, seconds) {
      const entry = live(key);
      if (entry) {
        entry.expiresAt = now() + seconds * 1000;
      }
      return entry ? 1 : 0;
    },
  };
}
