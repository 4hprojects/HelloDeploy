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

function renderDomains(overrides = {}) {
  return renderFile(domainsPath, {
    project,
    membership: overrides.membership ?? { role: 'OWNER' },
    domains: overrides.domains ?? [],
    verificationToken: overrides.verificationToken ?? null,
    pendingHostname: overrides.pendingHostname ?? null,
    csrfToken: 'test-token',
  });
}

describe('guided custom domains', () => {
  it('guides a new owner through all four setup stages', async () => {
    const html = await renderDomains();

    assert.match(html, /Connect your domain/);
    assert.match(html, /Add your domain/);
    assert.match(html, /Add the DNS record/);
    assert.match(html, /Check ownership/);
    assert.match(html, /Domain goes live/);
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

  it('explains verified and active states without unnecessary owner action', async () => {
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

    assert.match(approvalHtml, /DNS verified\. Waiting for administrator activation/);
    assert.match(approvalHtml, /No action needed/);
    assert.match(activeHtml, /Connected/);
    assert.match(activeHtml, /Connected and ready for visitors/);
    assert.doesNotMatch(activeHtml, /method="POST"/);
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
