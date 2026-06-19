import { logger } from '@hellodeploy/observability';

const DEFAULT_ATTEMPTS = 12;
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 4_000;

/**
 * Poll an HTTP endpoint until it returns a 2xx/3xx response or attempts are exhausted.
 * The first successful response counts as healthy.
 *
 * @param {{
 *   url: string,
 *   attempts?: number,
 *   intervalMs?: number,
 *   timeoutMs?: number,
 * }} opts
 * @returns {Promise<{ healthy: boolean, finalStatus?: number, error?: string }>}
 */
export async function httpHealthCheck({
  url,
  attempts = DEFAULT_ATTEMPTS,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let lastError = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual', // treat redirects as healthy
      }).finally(() => clearTimeout(timer));

      lastStatus = res.status;

      if (res.status < 400) {
        logger.info('HealthCheck: passed', { url, status: res.status, attempt });
        return { healthy: true, finalStatus: res.status };
      }

      logger.info('HealthCheck: non-success status', { url, status: res.status, attempt });
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = `Timeout after ${timeoutMs}ms`;
      } else {
        lastError = err.message;
      }
      logger.info('HealthCheck: attempt failed', { url, attempt, error: lastError });
    }

    if (attempt < attempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    healthy: false,
    finalStatus: lastStatus ?? undefined,
    error: lastError ?? 'All health check attempts failed',
  };
}

/**
 * A fast readiness check — a single attempt with a shorter timeout.
 * Used to quickly detect immediate container crashes before the full health poll.
 *
 * @param {{ url: string, timeoutMs?: number }} opts
 * @returns {Promise<boolean>}
 */
export async function quickReadinessCheck({ url, timeoutMs = 2_000 }) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' }).finally(() =>
      clearTimeout(timer),
    );
    return res.status < 500;
  } catch {
    return false;
  }
}
