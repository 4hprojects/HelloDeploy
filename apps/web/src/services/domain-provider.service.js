/**
 * Work out who manages a domain's DNS, so the owner is told where to add the
 * record instead of being asked to figure it out.
 *
 * Detection reads authoritative nameservers and matches them against known
 * providers. It is advisory only: nothing is created, changed or authorised on
 * the owner's behalf, and a domain whose provider cannot be identified still
 * gets the full manual instructions.
 *
 * The DNS lookup is injected so this can be tested without touching the network.
 */

import { promises as dnsPromises } from 'node:dns';

/**
 * Nameserver suffixes that identify a provider, most specific first.
 * A provider absent from here is not an error — the flow falls back to generic
 * wording rather than guessing.
 */
const PROVIDER_PATTERNS = Object.freeze([
  { match: 'ns.cloudflare.com', name: 'Cloudflare', panel: 'Cloudflare dashboard → DNS → Records' },
  { match: 'awsdns', name: 'Amazon Route 53', panel: 'Route 53 → Hosted zones' },
  { match: 'domaincontrol.com', name: 'GoDaddy', panel: 'GoDaddy → My Products → DNS' },
  {
    match: 'registrar-servers.com',
    name: 'Namecheap',
    panel: 'Namecheap → Domain List → Advanced DNS',
  },
  { match: 'digitalocean.com', name: 'DigitalOcean', panel: 'DigitalOcean → Networking → Domains' },
  { match: 'googledomains.com', name: 'Google Domains', panel: 'your Google Domains DNS page' },
  { match: 'google.com', name: 'Google Cloud DNS', panel: 'Google Cloud DNS → Zones' },
  { match: 'squarespace', name: 'Squarespace', panel: 'Squarespace → Domains → DNS Settings' },
  { match: 'vercel-dns.com', name: 'Vercel', panel: 'Vercel → Domains' },
  { match: 'nsone.net', name: 'NS1', panel: 'your NS1 zone editor' },
  { match: 'dnsimple.com', name: 'DNSimple', panel: 'DNSimple → your domain → DNS' },
  { match: 'name.com', name: 'Name.com', panel: 'Name.com → My Domains → DNS Records' },
  { match: 'porkbun.com', name: 'Porkbun', panel: 'Porkbun → Domain Management → DNS' },
  { match: 'hover.com', name: 'Hover', panel: 'Hover → your domain → DNS' },
  { match: 'gandi.net', name: 'Gandi', panel: 'Gandi → Domain → DNS Records' },
  { match: 'ovh.net', name: 'OVH', panel: 'OVH → Domains → DNS zone' },
  { match: 'hostinger', name: 'Hostinger', panel: 'Hostinger → Domains → DNS / Nameservers' },
  { match: 'bluehost.com', name: 'Bluehost', panel: 'Bluehost → Domains → DNS' },
  { match: 'azure-dns', name: 'Azure DNS', panel: 'Azure → DNS zones' },
  { match: 'netlify.com', name: 'Netlify', panel: 'Netlify → Domains → DNS panel' },
  { match: 'wixdns.net', name: 'Wix', panel: 'Wix → Domains → DNS records' },
  { match: 'shopify', name: 'Shopify', panel: 'Shopify → Settings → Domains' },
]);

/**
 * Candidate zones for a hostname, apex last.
 *
 * Nameservers are published at the zone apex, not at every label, so a lookup on
 * `app.example.com` usually returns nothing while `example.com` answers. Walking
 * up avoids needing a public-suffix list, at the cost of one lookup per level.
 *
 * @param {string} hostname
 * @returns {string[]}
 */
export function zoneCandidates(hostname) {
  const labels = String(hostname ?? '')
    .toLowerCase()
    .replace(/\.$/, '')
    .split('.')
    .filter(Boolean);

  const candidates = [];
  // Stop at two labels: nothing shorter is a registrable domain.
  for (let start = 0; start <= labels.length - 2; start += 1) {
    candidates.push(labels.slice(start).join('.'));
  }
  return candidates;
}

/**
 * Match a provider from a set of nameserver hostnames.
 *
 * @param {string[]} nameservers
 * @returns {{ name: string, panel: string }|null}
 */
export function matchProvider(nameservers) {
  const joined = (nameservers ?? []).join(' ').toLowerCase();
  const found = PROVIDER_PATTERNS.find((pattern) => joined.includes(pattern.match));
  return found ? { name: found.name, panel: found.panel } : null;
}

/**
 * @param {string} hostname
 * @param {{ resolveNs?: (zone: string) => Promise<string[]> }} [deps]
 * @returns {Promise<{
 *   provider: string|null,
 *   panel: string|null,
 *   nameservers: string[],
 *   zone: string|null,
 *   isDelegated: boolean,
 * }>}
 */
export async function detectDomainProvider(hostname, deps = {}) {
  const resolveNs = deps.resolveNs ?? ((zone) => dnsPromises.resolveNs(zone));

  for (const zone of zoneCandidates(hostname)) {
    let nameservers;
    try {
      nameservers = await resolveNs(zone);
    } catch {
      // NODATA and NXDOMAIN are both normal while walking up to the apex.
      continue;
    }

    if (!nameservers || nameservers.length === 0) {
      continue;
    }

    const sorted = [...nameservers].map((ns) => ns.toLowerCase()).sort();
    const provider = matchProvider(sorted);

    return {
      provider: provider?.name ?? null,
      panel: provider?.panel ?? null,
      nameservers: sorted,
      zone,
      isDelegated: true,
    };
  }

  // No nameservers anywhere up the tree: the domain is probably not registered,
  // or was registered moments ago.
  return { provider: null, panel: null, nameservers: [], zone: null, isDelegated: false };
}

/**
 * What to tell the owner about where to add the record.
 *
 * @param {{ provider: string|null, panel: string|null, isDelegated: boolean }} detection
 * @returns {{ headline: string, detail: string }}
 */
export function providerGuidance(detection) {
  if (!detection.isDelegated) {
    return {
      headline: 'We could not find this domain yet',
      detail:
        'Check the spelling. If you registered it in the last few minutes, wait a little and try again.',
    };
  }

  if (!detection.provider) {
    return {
      headline: 'Add the record with whoever manages your DNS',
      detail:
        'We could not recognise your provider. Use the service your nameservers point to — that is where DNS records are edited, even if you bought the domain somewhere else.',
    };
  }

  return {
    headline: `Your DNS is managed by ${detection.provider}`,
    detail: `Add the record in ${detection.panel}. This is where DNS is edited even if you bought the domain somewhere else.`,
  };
}
