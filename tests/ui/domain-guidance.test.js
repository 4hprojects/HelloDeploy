import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';

const { renderFile } = ejs;

const domainsPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
);
const layoutCss = await readFile(
  new URL('../../apps/web/public/css/layout.css', import.meta.url),
  'utf8',
);
const browser = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');
const controller = await readFile(
  new URL('../../apps/web/src/controllers/domain.controller.js', import.meta.url),
  'utf8',
);

const project = {
  _id: '64b7f8e2a1c9d4f5b6a7c8d8',
  name: 'HelloRun',
  slug: 'hellorun-e783',
};
const pendingDomain = {
  _id: '64b7f8e2a1c9d4f5b6a7c8d9',
  hostnameNormalized: 'hellorun.online',
  status: 'PENDING_VERIFICATION',
  createdAt: new Date('2026-07-02T00:00:00.000Z'),
};

const CUSTOM_HOSTNAME_TARGET = 'customers.hellodeploy.online';

// Mirrors the controller, which resolves each domain's target before rendering.
function withRoutingTarget(domain) {
  if (domain.cfCustomHostnameId) {
    return { ...domain, routingTarget: CUSTOM_HOSTNAME_TARGET };
  }
  return {
    ...domain,
    routingTarget: domain.tunnelId ? `${domain.tunnelId}.cfargotunnel.com` : null,
  };
}

function renderDomains(overrides = {}) {
  return renderFile(domainsPath, {
    project,
    membership: overrides.membership ?? { role: 'OWNER' },
    domains: (overrides.domains ?? []).map(withRoutingTarget),
    customHostnamesEnabled: overrides.customHostnamesEnabled ?? false,
    verificationToken: overrides.verificationToken ?? null,
    pendingHostname: overrides.pendingHostname ?? null,
    domainLimit: overrides.domainLimit ?? null,
    platformAppUrl: overrides.platformAppUrl ?? 'https://hellorun-e783.hellodeploy.online',
    csrfToken: 'test-token',
    statusPresentation: overrides.statusPresentation,
  });
}

describe('guided custom domains', () => {
  it('guides a new owner through all five setup stages', async () => {
    const html = await renderDomains();

    assert.match(html, /Connect your domain/);
    assert.match(html, /Add your domain/);
    assert.match(html, /Add the DNS record/);
    assert.match(html, /Check ownership/);
    assert.match(html, /Connect routing/);
    assert.match(html, /Domain is live/);
    assert.match(html, /action="\/projects\/hellorun-e783\/domains"/);
    assert.match(html, /Do not include/);
  });

  it('renders the one-time TXT record with provider guidance and copy controls', async () => {
    const html = await renderDomains({
      domains: [pendingDomain],
      verificationToken: 'secret-token',
      pendingHostname: 'hellorun.online',
    });

    assert.match(html, /Your next step/);
    assert.match(html, /shown only once/);
    assert.match(html, /nameservers are Cloudflare/);
    assert.match(html, /purchased the domain from GoDaddy/);
    assert.match(html, /_hellodeploy-verify\.hellorun\.online/);
    assert.match(html, /hellodeploy-verify=secret-token/);
    assert.match(html, /data-copy-label="TXT record name"/);
    assert.match(html, /data-copy-label="TXT record value"/);
    assert.match(html, /data-copy-status/);
    assert.match(
      html,
      /action="\/projects\/hellorun-e783\/domains\/64b7f8e2a1c9d4f5b6a7c8d9\/verify"/,
    );
  });

  it('provides a safe recovery path when the one-time value is gone', async () => {
    const html = await renderDomains({ domains: [pendingDomain] });

    assert.match(html, /Continue DNS setup/);
    assert.match(html, /secret TXT value is shown only once/);
    assert.match(html, /Check DNS record/);
    assert.match(html, /Remove and restart/);
    assert.match(html, /generate a new one-time TXT value/);
    assert.match(html, /_hellodeploy-verify\.hellorun\.online/);
    assert.match(html, /Cloudflare nameservers mean/);
  });

  it('preserves legacy approval guidance and explains active states', async () => {
    const approvalHtml = await renderDomains({
      domains: [
        {
          ...pendingDomain,
          status: 'PENDING_ADMIN_APPROVAL',
        },
      ],
    });
    const activeHtml = await renderDomains({
      membership: { role: 'VIEWER' },
      domains: [
        {
          ...pendingDomain,
          status: 'ACTIVE',
        },
      ],
    });

    assert.match(approvalHtml, /Legacy verification is waiting for administrator activation/);
    assert.match(approvalHtml, /No action needed/);
    assert.match(activeHtml, /Routing setup/);
    assert.match(activeHtml, /An administrator is preparing the connection/);
    assert.doesNotMatch(activeHtml, /method="POST"/);
  });

  it('shows automatic activation progress and polls for state changes', async () => {
    const html = await renderDomains({
      domains: [
        {
          ...pendingDomain,
          status: 'ACTIVATING',
          operationStartedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    assert.match(html, /data-domain-status-url="\/projects\/hellorun-e783\/domains\/status"/);
    assert.match(html, /Public routing is being activated/);
    assert.match(browser, /function initDomainStatusPolling/);
    assert.match(browser, /90_000/);
    assert.match(browser, /window\.setTimeout\(poll, 2000\)/);
  });

  it('copies through the Clipboard API and announces the result', () => {
    assert.match(browser, /function initDnsCopyButtons/);
    assert.match(browser, /navigator\.clipboard\.writeText\(value\)/);
    assert.match(browser, /status\.textContent = `\$\{label\} copied\.`/);
    assert.match(browser, /initDnsCopyButtons\(\)/);
  });

  it('lands a newly added domain on the one-time record instructions', () => {
    assert.match(
      controller,
      /res\.redirect\(`\/projects\/\$\{project\.slug\}\/domains#dns-record-instructions`\)/,
    );
  });

  it('wraps long DNS values and collapses the guide for mobile', () => {
    assert.match(layoutCss, /\.dns-record__value[\s\S]*overflow-wrap: anywhere/);
    assert.match(layoutCss, /\.domain-hostname[\s\S]*overflow-wrap: anywhere/);
    assert.match(
      layoutCss,
      /@media \(max-width: 40rem\)[\s\S]*\.domain-steps[\s\S]*grid-template-columns: 1fr/,
    );
    assert.match(
      layoutCss,
      /@media \(max-width: 40rem\)[\s\S]*\.dns-record__row[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/,
    );
  });
});

describe('routing record guidance', () => {
  const verifiedDomain = {
    _id: '64b7f8e2a1c9d4f5b6a7c8da',
    hostnameNormalized: 'hellorun.online',
    status: 'ACTIVE',
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    updatedAt: new Date('2026-07-02T00:00:00.000Z'),
  };
  const tunnelId = '79fad542-82f7-4225-b917-4fcdb042e280';

  it('publishes the CNAME target once a tunnel is recorded', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, tunnelId }] });
    assert.match(html, new RegExp(`${tunnelId}\\.cfargotunnel\\.com`));
  });

  it('offers a copy control for the CNAME target', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, tunnelId }] });
    assert.match(html, /data-copy-label="CNAME record target"/);
  });

  it('explains that the record is what sends visitors to the app', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, tunnelId }] });
    assert.match(html, /until you add it, the address will not open your app/);
  });

  it('never invents a target before an administrator records the tunnel', async () => {
    const html = await renderDomains({ domains: [verifiedDomain] });
    assert.doesNotMatch(html, /cfargotunnel/);
  });

  it('says who the owner is waiting on when no tunnel exists yet', async () => {
    const html = await renderDomains({ domains: [verifiedDomain] });
    assert.match(html, /administrator is preparing the connection/);
  });

  it('tells a waiting owner to keep existing records until the CNAME is ready', async () => {
    const html = await renderDomains({ domains: [verifiedDomain] });
    assert.match(html, /Don't delete them yet/);
  });

  it('shows which record to remove and which to add', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, tunnelId }] });
    assert.match(
      html,
      /<th scope="row">Remove<\/th>[\s\S]*?<th scope="row">Add<\/th>[\s\S]*?cfargotunnel\.com/,
    );
  });

  it('walks the owner through deleting the old records by name', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, tunnelId }] });
    assert.match(
      html,
      /is exactly <code class="code-inline">hellorun\.online<\/code>[\s\S]*?<strong>Delete<\/strong>/,
    );
  });

  it('reassures the owner that email records stay untouched', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, tunnelId }] });
    assert.match(html, /Your email keeps working/);
  });

  it('shows an expected waiting result without error styling', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, routingDetail: 'Not connected yet, and that is expected.' }],
    });
    assert.match(html, /<span class="text-muted text-sm" role="status">Not connected yet/);
  });

  it('stops calling a routed domain connected before routing is confirmed', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, tunnelId }] });
    assert.match(html, /Add the CNAME record above so visitors reach it/);
  });

  it('reports a confirmed domain as live', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, tunnelId, routingState: 'LIVE' }],
    });
    assert.match(html, /visitors reach your app/);
  });

  it('surfaces the reason a check failed', async () => {
    const html = await renderDomains({
      domains: [
        {
          ...verifiedDomain,
          tunnelId,
          routingState: 'TUNNEL_DOWN',
          routingDetail:
            "Your domain points to HelloDeploy, but the connection for it isn't running yet. (HTTP 530)",
        },
      ],
    });
    assert.match(html, /the connection for it isn&#39;t running yet/);
  });

  it('offers a routing check for an active domain with no recorded tunnel', async () => {
    const html = await renderDomains({ domains: [{ ...verifiedDomain, status: 'ACTIVE' }] });
    assert.match(html, /\/domains\/[0-9a-f]+\/routing-check"/);
  });

  it('drops the routing next step once the domain is live', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, status: 'ACTIVE', routingState: 'LIVE' }],
    });
    assert.doesNotMatch(html, /Send your visitors to HelloDeploy/);
  });

  it('marks the guide live once a domain is confirmed live', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, status: 'ACTIVE', routingState: 'LIVE' }],
    });
    assert.match(html, /status-badge--healthy">Live</);
  });

  it('labels domain progress with domain statuses rather than project ones', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, status: 'ACTIVE' }],
      statusPresentation: (kind) => ({ label: `kind:${kind}`, hint: '', tone: 'healthy' }),
    });
    assert.match(html, /kind:domain/);
  });

  it('lays all five setup steps out on one row', () => {
    assert.match(layoutCss, /\.domain-steps \{[^}]*repeat\(5, minmax\(0, 1fr\)\)/);
  });
});

describe('admin-free custom domain connection', () => {
  const verifiedDomain = {
    _id: '64b7f8e2a1c9d4f5b6a7c8db',
    hostnameNormalized: 'helloeventhub.online',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
  };

  it('offers the owner the DNS record without waiting for an administrator', async () => {
    const html = await renderDomains({ domains: [verifiedDomain], customHostnamesEnabled: true });
    assert.match(
      html,
      /action="\/projects\/hellorun-e783\/domains\/64b7f8e2a1c9d4f5b6a7c8db\/connect"[\s\S]*?Get my DNS record/,
    );
  });

  it('keeps the administrator wording when the feature is off', async () => {
    const html = await renderDomains({ domains: [verifiedDomain] });
    assert.doesNotMatch(html, /Get my DNS record/);
  });

  it('points a connected domain at the shared platform target', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, cfCustomHostnameId: 'cf-1' }],
      customHostnamesEnabled: true,
    });
    assert.match(html, /data-copy-value="customers\.hellodeploy\.online"/);
  });

  it('lets a connected domain use any DNS provider', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, cfCustomHostnameId: 'cf-1' }],
      customHostnamesEnabled: true,
    });
    assert.match(html, /often the company you bought the domain from/);
  });

  it('explains what to do when a provider refuses a CNAME on the root domain', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, cfCustomHostnameId: 'cf-1' }],
      customHostnamesEnabled: true,
    });
    assert.match(html, /ALIAS, ANAME or "CNAME flattening"/);
  });

  it('tells a connected domain on Cloudflare to use DNS only', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, cfCustomHostnameId: 'cf-1' }],
      customHostnamesEnabled: true,
    });
    assert.match(html, /set Proxy status to <strong>DNS only<\/strong> \(grey cloud\)/);
  });

  it('keeps the proxied instruction for a tunnel-connected domain', async () => {
    const html = await renderDomains({
      domains: [{ ...verifiedDomain, tunnelId: '79fad542-82f7-4225-b917-4fcdb042e280' }],
    });
    assert.match(html, /leave Proxy status on \(orange cloud\)/);
  });

  it('shows an extra validation record when Cloudflare asks for one', async () => {
    const html = await renderDomains({
      domains: [
        {
          ...verifiedDomain,
          cfCustomHostnameId: 'cf-1',
          cfValidationRecords: [
            { type: 'TXT', name: '_cf-custom-hostname.helloeventhub.online', value: 'abc-123' },
          ],
        },
      ],
      customHostnamesEnabled: true,
    });
    assert.match(html, /data-copy-value="_cf-custom-hostname\.helloeventhub\.online"/);
  });
});

describe('after a domain goes live', () => {
  const liveDomain = {
    _id: '64b7f8e2a1c9d4f5b6a7c8dc',
    hostnameNormalized: 'helloeventhub.online',
    status: 'ACTIVE',
    routingState: 'LIVE',
    cfCustomHostnameId: 'cf-1',
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
  };

  it('links to the live site in a new tab', async () => {
    const html = await renderDomains({ domains: [liveDomain] });
    assert.match(
      html,
      /href="https:\/\/helloeventhub\.online"\s+target="_blank" rel="noopener noreferrer">\s+Open your site/,
    );
  });

  it('explains how to make www reach the app', async () => {
    const html = await renderDomains({ domains: [liveDomain] });
    assert.match(html, /template <strong>Redirect from WWW to root<\/strong>/);
  });

  it('tells the owner which record must stay in place', async () => {
    const html = await renderDomains({ domains: [liveDomain] });
    assert.match(html, /Leave the CNAME[\s\S]*?customers\.hellodeploy\.online<\/code>\s+in place/);
  });

  it('points to the HelloDeploy address as a backup', async () => {
    const html = await renderDomains({ domains: [liveDomain] });
    assert.match(html, />hellorun-e783\.hellodeploy\.online<\/a>/);
  });

  it('shows no live panel before the domain is live', async () => {
    const html = await renderDomains({ domains: [{ ...liveDomain, routingState: 'UNKNOWN' }] });
    assert.doesNotMatch(html, /Open your site/);
  });

  it('replaces the add form with the limit once the project is full', async () => {
    const html = await renderDomains({ domains: [liveDomain], domainLimit: 1 });
    assert.match(html, /This project includes 1 custom domain\./);
  });

  it('hides the add form once the project is full', async () => {
    const html = await renderDomains({ domains: [liveDomain], domainLimit: 1 });
    assert.doesNotMatch(html, /name="hostname"/);
  });
});
