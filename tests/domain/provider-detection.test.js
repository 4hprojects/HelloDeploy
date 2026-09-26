import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  detectDomainProvider,
  matchProvider,
  providerGuidance,
  zoneCandidates,
} from '../../apps/web/src/services/domain-provider.service.js';

/** A resolver that answers only for the zones given, as real DNS would. */
function resolverFor(zones) {
  return async (zone) => {
    if (!Object.hasOwn(zones, zone)) {
      const error = new Error('queryNs ENODATA');
      error.code = 'ENODATA';
      throw error;
    }
    return zones[zone];
  };
}

describe('zone candidates', () => {
  it('tries the full hostname first', () => {
    assert.equal(zoneCandidates('app.example.com')[0], 'app.example.com');
  });

  it('walks up to the registrable domain', () => {
    assert.deepEqual(zoneCandidates('app.example.com'), ['app.example.com', 'example.com']);
  });

  it('stops before a bare suffix', () => {
    assert.ok(!zoneCandidates('app.example.com').includes('com'));
  });

  it('handles a bare domain', () => {
    assert.deepEqual(zoneCandidates('example.com'), ['example.com']);
  });

  it('ignores a trailing dot', () => {
    assert.deepEqual(zoneCandidates('example.com.'), ['example.com']);
  });
});

describe('provider matching', () => {
  it('recognises Cloudflare', () => {
    assert.equal(
      matchProvider(['amir.ns.cloudflare.com', 'kia.ns.cloudflare.com']).name,
      'Cloudflare',
    );
  });

  it('recognises Route 53', () => {
    assert.equal(matchProvider(['ns-1234.awsdns-56.org']).name, 'Amazon Route 53');
  });

  it('recognises GoDaddy', () => {
    assert.equal(matchProvider(['ns01.domaincontrol.com']).name, 'GoDaddy');
  });

  it('recognises Namecheap', () => {
    assert.equal(matchProvider(['dns1.registrar-servers.com']).name, 'Namecheap');
  });

  it('says nothing for an unknown provider', () => {
    assert.equal(matchProvider(['ns1.some-small-host.example']), null);
  });

  it('says nothing when there are no nameservers', () => {
    assert.equal(matchProvider([]), null);
  });

  it('names where to add the record', () => {
    assert.match(matchProvider(['amir.ns.cloudflare.com']).panel, /Cloudflare dashboard/);
  });
});

describe('detecting a domain provider', () => {
  it('finds the provider at the zone apex', async () => {
    const detection = await detectDomainProvider('app.example.com', {
      resolveNs: resolverFor({ 'example.com': ['amir.ns.cloudflare.com'] }),
    });

    assert.equal(detection.provider, 'Cloudflare');
  });

  it('reports which zone answered', async () => {
    const detection = await detectDomainProvider('app.example.com', {
      resolveNs: resolverFor({ 'example.com': ['amir.ns.cloudflare.com'] }),
    });

    assert.equal(detection.zone, 'example.com');
  });

  it('prefers a delegated subdomain over its parent', async () => {
    const detection = await detectDomainProvider('app.example.com', {
      resolveNs: resolverFor({
        'app.example.com': ['ns-1234.awsdns-56.org'],
        'example.com': ['amir.ns.cloudflare.com'],
      }),
    });

    assert.equal(detection.provider, 'Amazon Route 53');
  });

  it('returns the nameservers it found', async () => {
    const detection = await detectDomainProvider('example.com', {
      resolveNs: resolverFor({ 'example.com': ['b.ns.example', 'a.ns.example'] }),
    });

    assert.deepEqual(detection.nameservers, ['a.ns.example', 'b.ns.example']);
  });

  it('reports an unregistered domain as not delegated', async () => {
    const detection = await detectDomainProvider('nope.example', {
      resolveNs: resolverFor({}),
    });

    assert.equal(detection.isDelegated, false);
  });

  it('treats an empty answer as no delegation', async () => {
    const detection = await detectDomainProvider('example.com', {
      resolveNs: resolverFor({ 'example.com': [] }),
    });

    assert.equal(detection.isDelegated, false);
  });

  it('still reports delegation when the provider is unknown', async () => {
    const detection = await detectDomainProvider('example.com', {
      resolveNs: resolverFor({ 'example.com': ['ns1.tiny-host.example'] }),
    });

    assert.equal(detection.isDelegated, true);
  });

  it('never claims a provider it could not match', async () => {
    const detection = await detectDomainProvider('example.com', {
      resolveNs: resolverFor({ 'example.com': ['ns1.tiny-host.example'] }),
    });

    assert.equal(detection.provider, null);
  });
});

describe('provider guidance', () => {
  it('names the provider when one was found', () => {
    const guidance = providerGuidance({
      provider: 'Cloudflare',
      panel: 'Cloudflare dashboard → DNS → Records',
      isDelegated: true,
    });

    assert.match(guidance.headline, /managed by Cloudflare/);
  });

  it('explains that DNS is edited where nameservers point, not where it was bought', () => {
    const guidance = providerGuidance({
      provider: 'Cloudflare',
      panel: 'Cloudflare dashboard → DNS → Records',
      isDelegated: true,
    });

    assert.match(guidance.detail, /bought the domain somewhere else/);
  });

  it('falls back to generic wording for an unknown provider', () => {
    const guidance = providerGuidance({ provider: null, panel: null, isDelegated: true });
    assert.match(guidance.headline, /whoever manages your DNS/);
  });

  it('suggests checking the spelling when nothing resolves', () => {
    const guidance = providerGuidance({ provider: null, panel: null, isDelegated: false });
    assert.match(guidance.detail, /Check the spelling/);
  });
});
