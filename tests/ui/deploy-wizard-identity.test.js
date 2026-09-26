import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const { renderFile } = ejs;
const identityView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/wizard/identity.ejs', import.meta.url),
);

const clientScript = await readFile(
  new URL('../../apps/web/public/js/app.js', import.meta.url),
  'utf8',
);

const steps = [
  { key: 'analyze', label: 'Check your project', status: 'COMPLETE', href: '#', position: 2 },
  { key: 'identity', label: 'Name your website', status: 'CURRENT', href: '#', position: 3 },
];

function renderIdentity(overrides = {}) {
  return renderFile(identityView, {
    project: { slug: 'hellouniversity', name: 'HelloUniversity' },
    membership: { role: 'OWNER' },
    wizardSteps: steps,
    deploymentDomain: 'hellodeploy.online',
    values: overrides.values ?? { name: 'HelloUniversity', address: 'hellouniversity' },
    errors: overrides.errors ?? {},
    csrfToken: 'placeholder',
  });
}

describe('website identity step', () => {
  it('prefills the suggested name', async () => {
    assert.match(await renderIdentity(), /value="HelloUniversity"/);
  });

  it('prefills the suggested address', async () => {
    assert.match(await renderIdentity(), /value="hellouniversity"/);
  });

  it('shows the full address the visitor will use', async () => {
    assert.match(await renderIdentity(), /\.hellodeploy\.online/);
  });

  it('warns that the address is fixed after publishing', async () => {
    assert.match(await renderIdentity(), /the address is fixed once you publish/);
  });

  it('announces availability changes to screen readers', async () => {
    assert.match(await renderIdentity(), /aria-live="polite"/);
  });

  it('points the field at the availability check', async () => {
    assert.match(await renderIdentity(), /data-address-check-url="[^"]*address-available"/);
  });

  it('shows a rejected address with its reason', async () => {
    const html = await renderIdentity({
      errors: { address: 'That address is already taken. Try another one.' },
      values: { name: 'HelloUniversity', address: 'taken' },
    });

    assert.match(html, /That address is already taken/);
  });

  it('ties a name error to its input', async () => {
    const html = await renderIdentity({
      errors: { name: 'Give your website a name between 2 and 100 characters.' },
      values: { name: 'x', address: 'hellouniversity' },
    });

    assert.match(html, /aria-describedby="name-error"/);
  });

  it('keeps what the owner typed after a rejection', async () => {
    const html = await renderIdentity({
      errors: { address: 'That address is already taken. Try another one.' },
      values: { name: 'My Site', address: 'taken' },
    });

    assert.match(html, /value="My Site"/);
  });

  it('mentions no subdomain, DNS or nginx vocabulary', async () => {
    assert.doesNotMatch(await renderIdentity(), /subdomain|nginx|DNS record|reverse proxy/i);
  });
});

describe('website address field behaviour', () => {
  it('runs on page load', () => {
    assert.match(clientScript, /initAddressAvailability\(\);/);
  });

  it('waits for typing to settle before checking', () => {
    assert.match(clientScript, /window\.setTimeout\(check, 350\)/);
  });

  it('ignores a reply that a newer keystroke has superseded', () => {
    assert.match(clientScript, /if \(ticket !== sequence\)/);
  });

  it('falls back to neutral guidance when the check fails', () => {
    assert.match(clientScript, /setStatus\(neutralText, null\)/);
  });
});
