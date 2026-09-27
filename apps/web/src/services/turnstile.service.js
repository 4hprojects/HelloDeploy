import { logger } from '@hellodeploy/observability';

import { env } from '../config/env.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Cloudflare Turnstile token.
 *
 * Returns true when no secret is configured, so development and test
 * environments are not blocked by a challenge they cannot solve. Any other
 * failure — a rejected token, a network error — returns false, so a challenge
 * that cannot be verified is never treated as passed.
 *
 * @param {string} token The `cf-turnstile-response` field from the form.
 * @param {string} [sourceIp] The submitting client's address.
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstile(token, sourceIp) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return true;
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token ?? '',
      remoteip: sourceIp ?? '',
    });
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    // A Turnstile outage silently failing every submission would be hard to
    // spot without this trail.
    logger.warn('Turnstile verification request failed', { error: err.message });
    return false;
  }
}
