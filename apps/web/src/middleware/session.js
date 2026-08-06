import session from 'express-session';
import MongoStore from 'connect-mongo';
import { mongoose } from '@hellodeploy/database';
import { env } from '../config/env.js';

export function createSessionCookieOptions(secure = env.isProduction()) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };
}

// Wraps the Store methods express-session uses to persist to MongoDB so shutdown
// can wait for an in-flight write instead of racing it: closing the HTTP server
// doesn't guarantee a backgrounded store write has finished, and closing the
// database out from under one turns into an unhandled MongoExpiredSessionError.
export function trackPendingStoreWrites(store) {
  const pending = new Set();

  function wrap(methodName) {
    const original = store[methodName]?.bind(store);
    if (typeof original !== 'function') {
      return;
    }
    store[methodName] = (...args) => {
      const callback = args[args.length - 1];
      const settled = new Promise((resolve) => {
        args[args.length - 1] = (...callbackArgs) => {
          pending.delete(settled);
          resolve();
          callback(...callbackArgs);
        };
      });
      pending.add(settled);
      original(...args);
    };
  }

  wrap('set');
  wrap('touch');

  return {
    async drain() {
      await Promise.allSettled([...pending]);
    },
  };
}

export function createSessionMiddleware(options = {}) {
  const store =
    options.store ??
    MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      ttl: 24 * 60 * 60, // 24 hours in seconds
      autoRemove: 'interval',
      autoRemoveInterval: 10, // Minutes between cleanup runs
    });
  const { drain } = trackPendingStoreWrites(store);

  const middleware = session({
    name: 'hellodeploy.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset TTL on every response
    cookie: createSessionCookieOptions(),
    store,
  });
  middleware.drainPendingWrites = drain;
  return middleware;
}
