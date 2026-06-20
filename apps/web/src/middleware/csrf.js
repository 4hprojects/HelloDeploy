import { timingSafeEqual } from 'crypto';
import { generateRawToken } from '@hellodeploy/security';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Synchronizer token pattern CSRF protection.
 *
 * - Issues a per-session CSRF token stored in req.session.
 * - All mutation requests (POST, PUT, PATCH, DELETE) must submit the token
 *   as _csrf in the request body or X-CSRF-Token header.
 * - API routes under /api/v1 that carry their own session cookie will also
 *   be protected; they should send the token in the X-CSRF-Token header.
 */
export function csrfMiddleware(req, res, next) {
  // Issue token if the session exists but has no token yet
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = generateRawToken(32);
  }

  // Expose the helper on the request so controllers can read it
  req.csrfToken = () => req.session?.csrfToken ?? '';

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const sessionToken = req.session?.csrfToken;
  const submittedToken = req.body?._csrf ?? req.headers['x-csrf-token'];

  const sessionBuf = sessionToken ? Buffer.from(sessionToken) : null;
  const submittedBuf = submittedToken ? Buffer.from(submittedToken) : null;
  const tokensMatch =
    sessionBuf &&
    submittedBuf &&
    sessionBuf.length === submittedBuf.length &&
    timingSafeEqual(sessionBuf, submittedBuf);

  if (!tokensMatch) {
    return res.status(403).render('pages/error', {
      title: 'Forbidden',
      layout: 'layouts/main',
      message: 'Invalid or missing CSRF token. Please refresh and try again.',
    });
  }

  next();
}
