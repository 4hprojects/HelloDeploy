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

export function createSessionMiddleware(options = {}) {
  const store = options.store ?? MongoStore.create({
    client: mongoose.connection.getClient(),
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 24 hours in seconds
    autoRemove: 'interval',
    autoRemoveInterval: 10, // Minutes between cleanup runs
  });

  return session({
    name: 'hellodeploy.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset TTL on every response
    cookie: createSessionCookieOptions(),
    store,
  });
}
