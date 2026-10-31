import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import ejs from 'ejs';

const { donationOptions } = await import('../../apps/web/src/config/donations.js');

const pilotView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/pilot.ejs', import.meta.url),
);
const PAYPAL = 'https://www.paypal.com/donate?hosted_button_id=ABCDEFGH12';
const planDefaults = {
  maxOwnedProjects: 1,
  maxRunningApps: 1,
  deploymentsPerMonth: 10,
  memoryMb: 256,
  cpuCores: 0.25,
  maxCustomDomains: 1,
  maxRollbackReleases: 3,
};

function renderPilot(donations) {
  return ejs.renderFile(pilotView, {
    planDefaults,
    donations,
    legalContactEmail: 'support@example.test',
    legalOperator: '4H Projects',
  });
}

describe('donations', () => {
  it('stay hidden while the owner switch is off', () => {
    assert.equal(donationOptions({ enabled: false, paypalUrl: PAYPAL }), null);
  });

  it('stay hidden when enabled without a verified destination', () => {
    assert.equal(
      donationOptions({ enabled: true, paypalUrl: '', gcashQrPath: '', bankQrPath: '' }),
      null,
    );
  });

  it('leave the pilot page without a donation section when hidden', async () => {
    assert.doesNotMatch(await renderPilot(null), /Support HelloDeploy/);
  });

  it('state that a donation buys no quota, priority, or tax deduction', async () => {
    const html = await renderPilot({ paypalUrl: PAYPAL, gcashQrPath: '', bankQrPath: '' });
    assert.match(
      html,
      /does not change your limits[\s\S]*not a registered charity[\s\S]*not tax-deductible/,
    );
  });

  it('link only the configured PayPal destination', async () => {
    const html = await renderPilot({ paypalUrl: PAYPAL, gcashQrPath: '', bankQrPath: '' });
    assert.deepEqual(html.match(/https:\/\/www\.paypal\.com[^"]*/g), [PAYPAL]);
  });
});
