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
