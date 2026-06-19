import session from 'express-session';
import MongoStore from 'connect-mongo';
import { env } from '../config/env.js';

export function createSessionMiddleware() {
  return session({
    name: 'hellodeploy.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset TTL on every response
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.isProduction(),
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    store: MongoStore.create({
      mongoUrl: env.MONGODB_URI,
      collectionName: 'sessions',
      ttl: 24 * 60 * 60, // 24 hours in seconds
      autoRemove: 'interval',
      autoRemoveInterval: 10, // Minutes between cleanup runs
    }),
  });
}
