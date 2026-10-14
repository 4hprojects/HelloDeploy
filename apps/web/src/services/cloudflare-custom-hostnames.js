import { logger } from '@hellodeploy/observability';

import { env } from '../config/env.js';

// Cloudflare for SaaS: an owner's hostname registered on the platform zone, so
// their single CNAME to CUSTOM_HOSTNAME_TARGET works from any DNS provider.
// Without it a proxied CNAME across Cloudflare accounts is refused (error
// 1014) and every domain needed an admin-made tunnel in the owner's account.
const API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 15_000;
const DUPLICATE_HOSTNAME_CODE = 1406;

export function isCustomHostnamesEnabled(config = env) {
  return Boolean(
    config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID && config.CUSTOM_HOSTNAME_TARGET,
  );
}

/** Null when the feature is not configured, so callers keep the tunnel flow. */
export function defaultCustomHostnameClient() {
  if (!isCustomHostnamesEnabled()) {
    return null;
  }
  return createCustomHostnameClient({
    token: env.CLOUDFLARE_API_TOKEN,
    zoneId: env.CLOUDFLARE_ZONE_ID,
  });
}

/**
 * Every method resolves to `{ ok: true, result }` or `{ ok: false, error }`.
 * Errors carry Cloudflare's text for logs only; callers show their own copy.
 */
export function createCustomHostnameClient({ token, zoneId, fetchImpl = fetch }) {
  const base = `${API_BASE}/zones/${encodeURIComponent(zoneId)}/custom_hostnames`;

  async function call(method, url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        const first = payload?.errors?.[0];
        return {
          ok: false,
          code: first?.code ?? null,
          error: first?.message ?? `Cloudflare API HTTP ${response.status}`,
        };
      }
      return { ok: true, result: payload.result };
    } catch (err) {
      return {
        ok: false,
        code: null,
        error: err.name === 'AbortError' ? 'Cloudflare API timed out' : err.message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    // Idempotent: a hostname already on the zone (an earlier attempt that
    // timed out after Cloudflare stored it) is looked up instead of failing.
    async register(hostname) {
      const created = await call('POST', base, {
        hostname,
        ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
      });
      if (created.ok || created.code !== DUPLICATE_HOSTNAME_CODE) {
        return created;
      }
      const found = await call('GET', `${base}?hostname=${encodeURIComponent(hostname)}`);
      if (!found.ok) {
        return found;
      }
      const match = found.result?.find((entry) => entry.hostname === hostname);
      return match
        ? { ok: true, result: match }
        : { ok: false, code: null, error: 'Duplicate hostname not found on zone' };
    },

    get(id) {
      return call('GET', `${base}/${encodeURIComponent(id)}`);
    },

    remove(id) {
      return call('DELETE', `${base}/${encodeURIComponent(id)}`);
    },
  };
}

/** Domain fields to store from a Cloudflare custom hostname record. */
export function toCustomHostnameFields(result) {
  const ownership = result.ownership_verification;
  const isPending = result.status !== 'active';
  return {
    cfCustomHostnameId: result.id,
    cfHostnameStatus: result.status ?? null,
    cfSslStatus: result.ssl?.status ?? null,
    cfValidationRecords:
      isPending && ownership?.name && ownership?.value
        ? [
            {
              type: (ownership.type ?? 'txt').toUpperCase(),
              name: ownership.name,
              value: ownership.value,
            },
          ]
        : [],
  };
}

export function logCustomHostnameFailure(action, hostname, failure) {
  logger.warn('CustomHostname: Cloudflare call failed', {
    action,
    hostname,
    code: failure.code,
    error: failure.error,
  });
}
