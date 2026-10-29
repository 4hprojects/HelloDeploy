import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 10_000;

export async function verifyTurnstile({
  token,
  sourceIp,
  expectedAction,
  secretKey = env.TURNSTILE_SECRET_KEY,
  fetchImpl = globalThis.fetch,
}) {
  if (!secretKey) {
    return true;
  }

  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return false;
  }

  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (sourceIp) {
      body.set('remoteip', sourceIp);
    }

    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const result = await response.json();
    const valid = result.success === true && result.action === expectedAction;

    if (!valid) {
      logger.warn('Turnstile verification rejected', {
        action: expectedAction,
        errorCodes: Array.isArray(result['error-codes']) ? result['error-codes'] : [],
      });
    }

    return valid;
  } catch (err) {
    logger.warn('Turnstile verification request failed', { error: err.message });
    return false;
  }
}

/**
 * Turnstile verification for guest-generated content. Unlike `verifyTurnstile`
 * it fails closed when no secret is configured and also binds the token to the
 * expected hostname. Siteverify itself refuses a token used twice
 * (`timeout-or-duplicate`), so tokens are single use.
 */
export async function verifyTurnstileStrict({
  token,
  sourceIp,
  expectedAction,
  expectedHostname,
  secretKey = env.TURNSTILE_SECRET_KEY,
  fetchImpl = globalThis.fetch,
}) {
  if (!secretKey) {
    return { valid: false, reason: 'not_configured' };
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { valid: false, reason: 'missing_token' };
  }

  let result;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (sourceIp) {
      body.set('remoteip', sourceIp);
    }
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    result = await response.json();
  } catch (err) {
    logger.warn('Turnstile verification request failed', { error: err.message });
    return { valid: false, reason: 'unavailable' };
  }

  const errorCodes = Array.isArray(result?.['error-codes']) ? result['error-codes'] : [];
  let reason = 'valid';
  if (result?.success !== true) {
    reason = errorCodes.includes('timeout-or-duplicate') ? 'expired_or_reused' : 'rejected';
  } else if (result.action !== expectedAction) {
    reason = 'wrong_action';
  } else if (result.hostname !== expectedHostname) {
    reason = 'wrong_hostname';
  }
  if (reason !== 'valid') {
    logger.warn('Turnstile verification rejected', { action: expectedAction, reason, errorCodes });
  }
  return { valid: reason === 'valid', reason };
}
