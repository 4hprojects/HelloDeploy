import http from 'node:http';

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

      const status = await getStatus(url, controller.signal).finally(() => clearTimeout(timer));

      lastStatus = status;

      if (status < 400) {
        logger.info('HealthCheck: passed', { url, status, attempt });
        return { healthy: true, finalStatus: status };
      }

      logger.info('HealthCheck: non-success status', { url, status, attempt });
      lastError = `HTTP ${status}`;
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

// The response comes from tenant code. node:http never decodes Content-Encoding,
// unlike fetch, so a crafted br/gzip body never reaches zlib (CVE-2026-111497).
// Redirects are not followed, so a 3xx counts as healthy.
function getStatus(url, signal) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: false, signal }, (res) => {
      resolve(res.statusCode);
      res.destroy();
    });
    req.on('error', reject);
  });
}
