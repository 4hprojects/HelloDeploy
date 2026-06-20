import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createRedisConnection } from '@hellodeploy/queue';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';

// One shared Redis client for all rate limit stores.
// Falls back to in-memory if Redis is unavailable.
let _redisClient = null;

function getRedisClient() {
  if (_redisClient) return _redisClient;
  try {
    _redisClient = createRedisConnection({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    });
    _redisClient.on('error', (err) => {
      logger.warn('[web] Rate limit Redis error', { error: err.message });
    });
    return _redisClient;
  } catch (err) {
    logger.warn('[web] Could not connect to Redis for rate limiting, falling back to memory store', {
      error: err.message,
    });
    return null;
  }
}

function makeStore(prefix) {
  const client = getRedisClient();
  if (!client) return undefined; // express-rate-limit falls back to memory store
  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix: `rl:${prefix}:`,
  });
}

const onLimitReached = (req, res, _options) => {
  // Serve a friendly HTML page for browser requests, JSON for API
  if (req.accepts('html')) {
    res.status(429).render('pages/error', {
      title: 'Too Many Requests',
      layout: 'layouts/main',
      message: 'Too many requests. Please wait a moment and try again.',
    });
  } else {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
  }
};

/** General pages / static assets */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('general'),
  handler: onLimitReached,
});

/** Registration — strict to deter spam accounts */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('register'),
  handler: onLimitReached,
});

/** Sign-in attempts */
export const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('signin'),
  handler: onLimitReached,
});

/** Verification email resend */
export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('resend-verify'),
  handler: onLimitReached,
});

/** Password reset initiation */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('pwd-reset'),
  handler: onLimitReached,
});
