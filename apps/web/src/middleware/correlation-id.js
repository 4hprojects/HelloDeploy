import { randomBytes } from 'node:crypto';

/** Attach a unique correlation ID to every request for tracing. */
export function correlationIdMiddleware(req, res, next) {
  req.correlationId = randomBytes(8).toString('hex');
  res.setHeader('X-Correlation-Id', req.correlationId);
  next();
}
