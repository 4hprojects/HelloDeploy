import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const { renderFile } = ejs;
const domainsView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
);
const clientScript = await readFile(
  new URL('../../apps/web/public/js/app.js', import.meta.url),
  'utf8',
);

const verifiedDomain = {
  _id: 'x1',
  hostnameNormalized: 'hellouniversity.online',
  status: 'VERIFIED',
  tunnelId: 'abc123',
  routingState: 'NOT_POINTED',
  routingCheckedAt: new Date('2026-09-26T10:00:00Z'),
  routingDetail: 'No X-HelloDeploy-Route header on the response',
  updatedAt: new Date('2026-09-26T10:00:00Z'),
};

const pendingDomain = {
  _id: 'p1',
  hostnameNormalized: 'hellouniversity.online',
  status: 'PENDING_VERIFICATION',
  updatedAt: new Date('2026-09-26T10:00:00Z'),
};

function render(overrides = {}) {
  return renderFile(domainsView, {
    project: { slug: 'hellouniversity', name: 'HelloUniversity' },
    membership: { role: overrides.role ?? 'OWNER' },
    domains: overrides.domains ?? [verifiedDomain],
    verificationToken: overrides.verificationToken ?? null,
    pendingHostname: overrides.pendingHostname ?? null,
    uiMode: overrides.uiMode ?? 'SIMPLE',
    csrfToken: 'placeholder',
  });
}

describe('domain page speaks about the website', () => {
  it('is titled for the owner, not for the platform', async () => {
    assert.match(await render(), /Your domain<\/h1>/);
  });
});

describe('telling the owner where to edit DNS', () => {
  it('asks for the provider once a domain is awaiting its record', async () => {
    const html = await render({
      domains: [pendingDomain],
      verificationToken: 'token-value',
      pendingHostname: 'hellouniversity.online',
    });

    assert.match(html, /data-domain-provider-url="[^"]*\/provider"/);
  });

  it('keeps usable guidance in place before the lookup answers', async () => {
    const html = await render({
      domains: [pendingDomain],
      verificationToken: 'token-value',
      pendingHostname: 'hellouniversity.online',
    });

    assert.match(html, /Use the provider that manages your nameservers/);
  });

  it('announces the answer to assistive technology', async () => {
    const html = await render({
      domains: [pendingDomain],
      verificationToken: 'token-value',
      pendingHostname: 'hellouniversity.online',
    });

    assert.match(html, /data-domain-provider[\s\S]{0,400}aria-live="polite"/);
  });

  it('looks the provider up after the page has rendered', () => {
    assert.match(clientScript, /function initDomainProviderHint\(\)/);
  });

  it('leaves the generic wording alone when the lookup fails', () => {
    assert.match(clientScript, /\/\/ Leave the generic guidance in place\./);
  });
});

describe('domain diagnostics stay out of simple mode', () => {
  it('does not show the probe’s own wording', async () => {
    assert.doesNotMatch(await render(), /X-HelloDeploy-Route/);
  });

  it('explains a domain that is not pointing here in settled terms', async () => {
    assert.match(await render(), /DNS changes can take some time/);
  });

  it('explains a domain answering as another site', async () => {
    const html = await render({
      domains: [{ ...verifiedDomain, routingState: 'FOREIGN' }],
    });

    assert.match(html, /opens a different website/);
  });

  it('avoids infrastructure vocabulary in its prose', async () => {
    // The CNAME target is a value the owner must copy, so it necessarily
    // appears. What should not appear is the platform explaining itself in
    // those terms.
    const html = await render();
    const prose = html
      .replace(/<code[\s\S]*?<\/code>/g, '')
      .replace(/data-copy-value="[^"]*"/g, '');

    assert.doesNotMatch(prose, /nameserver|cfargotunnel|reverse proxy|nginx/i);
  });
});

describe('domain diagnostics in advanced mode', () => {
  it('shows the routing state', async () => {
    assert.match(await render({ uiMode: 'ADVANCED' }), /Routing state/);
  });

  it('shows the probe’s own wording', async () => {
    assert.match(await render({ uiMode: 'ADVANCED' }), /X-HelloDeploy-Route/);
  });

  it('shows when it was last checked', async () => {
    assert.match(await render({ uiMode: 'ADVANCED' }), /Last checked/);
  });

  it('shows the target the record should point at', async () => {
    assert.match(await render({ uiMode: 'ADVANCED' }), /Expected target/);
  });
});

describe('root and www behaviour is stated', () => {
  it('says the record covers only the address given', async () => {
    assert.match(
      await render(),
      /covers <code class="code-inline">hellouniversity\.online<\/code> and/,
    );
  });

  it('says each form of the address must be added separately', async () => {
    assert.match(await render(), /add each one here as its own domain/);
  });

  it('does not imply a redirect that does not happen', async () => {
    assert.match(await render(), /does not redirect one to the other/);
  });
});

describe('existing connected domains are not disturbed', () => {
  it('still reports a live domain as live', async () => {
    const html = await render({
      domains: [{ ...verifiedDomain, status: 'ACTIVE', routingState: 'LIVE' }],
    });

    assert.match(html, /visitors reach your app/);
  });

  it('shows no action to a viewer', async () => {
    const html = await render({ role: 'VIEWER' });
    assert.doesNotMatch(html, /Check routing/);
  });
});
