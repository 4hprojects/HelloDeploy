/**
 * Connects a custom hostname to the shared Cloudflare tunnel.
 *
 * Connecting a domain used to need a person: an administrator created a
 * dedicated tunnel with the owner's credentials and pasted its id into the
 * admin screen, and until they did, the owner was told to wait. None of that is
 * necessary for a zone in an account this platform holds a token for — a tunnel
 * serves many hostnames, so connecting one is an ingress rule plus a DNS record.
 *
 * Every call is idempotent, so a retry repairs a partial run rather than
 * duplicating it.
 */
import { logger } from '@hellodeploy/observability';

const API_BASE = 'https://api.cloudflare.com/client/v4';

/** Why automation did not run. Each one falls back to the manual path. */
export const SkipReason = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  FOREIGN_ZONE: 'FOREIGN_ZONE',
  TUNNEL_LOCALLY_MANAGED: 'TUNNEL_LOCALLY_MANAGED',
});

function apiClient({ token, fetchImpl }) {
  return async function call(path, init = {}) {
    const response = await fetchImpl(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      // Cloudflare returns its own error array; surface the first message and
      // never the request, which carries the bearer token.
      const detail = body.errors?.[0]?.message ?? `HTTP ${response.status}`;
      throw new Error(`Cloudflare API ${path.split('?')[0]}: ${detail}`);
    }
    return body.result;
  };
}

/**
 * Find the zone a hostname belongs to, or null when this token cannot see it.
 *
 * Asks Cloudflare rather than parsing the hostname: only a real zone matches,
 * so multi-part suffixes like co.uk need no public-suffix list. A null result
 * is the ordinary "someone else's Cloudflare account" case, not a failure.
 */
export async function findZoneId(hostname, call) {
  const labels = hostname.split('.');
  for (let i = 0; i <= labels.length - 2; i += 1) {
    const candidate = labels.slice(i).join('.');
    const zones = await call(`/zones?name=${encodeURIComponent(candidate)}`);
    if (zones?.length) {
      return zones[0].id;
    }
  }
  return null;
}

/**
 * Add the hostname to the tunnel's ingress, ahead of its catch-all.
 *
 * Only works on a remotely-managed tunnel; one configured from a local file
 * ignores anything written here, which would leave DNS pointing at a tunnel
 * that refuses the hostname. The caller checks `source` first.
 */
export async function ensureTunnelHostname({ accountId, tunnelId, hostname, service }, call) {
  const path = `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`;
  const current = await call(path);
  const ingress = current?.config?.ingress ?? [];

  if (ingress.some((rule) => rule.hostname === hostname)) {
    return { changed: false };
  }

  // The final rule is the catch-all and must stay last.
  const catchAllIndex = ingress.findIndex((rule) => !rule.hostname);
  const insertAt = catchAllIndex === -1 ? ingress.length : catchAllIndex;
  const next = [...ingress];
  next.splice(insertAt, 0, { hostname, service });

  await call(path, {
    method: 'PUT',
    body: JSON.stringify({ config: { ...current.config, ingress: next } }),
  });
  return { changed: true };
}

/** Read how the tunnel is configured: 'cloudflare' (remote) or 'local'. */
export async function getTunnelConfigSource({ accountId, tunnelId }, call) {
  const current = await call(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`);
  return current?.source ?? null;
}

/** Point the hostname at the tunnel with a proxied CNAME, creating or correcting it. */
export async function ensureDnsRoute({ zoneId, hostname, tunnelId }, call) {
  const content = `${tunnelId}.cfargotunnel.com`;
  const existing = await call(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}&type=CNAME`,
  );
  const record = existing?.[0];

  if (record && record.content === content && record.proxied === true) {
    return { changed: false };
  }

  const payload = JSON.stringify({
    type: 'CNAME',
    name: hostname,
    content,
    // Traffic must enter through Cloudflare for a tunnel route to resolve.
    proxied: true,
  });

  if (record) {
    await call(`/zones/${zoneId}/dns_records/${record.id}`, { method: 'PATCH', body: payload });
  } else {
    await call(`/zones/${zoneId}/dns_records`, { method: 'POST', body: payload });
  }
  return { changed: true };
}

/**
 * Establish public routing for a hostname, or report why it must stay manual.
 *
 * Never throws for the ordinary cases — no token, a zone in another account, a
 * tunnel still configured from a file — because those are all "fall back to the
 * manual card", not errors. Genuine API failures do throw, so the job retries.
 */
export async function connectPublicRoute(
  hostname,
  { accountId, tunnelId, token, service = 'http://localhost:80', fetchImpl = fetch } = {},
) {
  if (!token || !accountId || !tunnelId) {
    return { automated: false, reason: SkipReason.NOT_CONFIGURED };
  }

  const call = apiClient({ token, fetchImpl });

  const source = await getTunnelConfigSource({ accountId, tunnelId }, call);
  if (source !== 'cloudflare') {
    logger.warn('ConnectPublicRoute: tunnel is not remotely managed; leaving domain manual', {
      hostname,
      source,
    });
    return { automated: false, reason: SkipReason.TUNNEL_LOCALLY_MANAGED };
  }

  const zoneId = await findZoneId(hostname, call);
  if (!zoneId) {
    return { automated: false, reason: SkipReason.FOREIGN_ZONE };
  }

  const ingress = await ensureTunnelHostname({ accountId, tunnelId, hostname, service }, call);
  const dns = await ensureDnsRoute({ zoneId, hostname, tunnelId }, call);
  logger.info('ConnectPublicRoute: public routing established', {
    hostname,
    ingressChanged: ingress.changed,
    dnsChanged: dns.changed,
  });

  return { automated: true, tunnelId, ingressChanged: ingress.changed, dnsChanged: dns.changed };
}
