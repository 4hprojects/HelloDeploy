import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';

const serverPagePath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/admin/server.ejs', import.meta.url),
);

function renderServerPage(webhooks) {
  return ejs.renderFile(serverPagePath, {
    title: 'Server & Queue',
    csrfToken: 'csrf',
    maintenance: { enabled: false, message: '' },
    server: {
      collectedAt: '2026-10-21T00:00:00Z',
      uptime: { human: '1d' },
      platformRelease: {},
      cpu: { cores: 4, load1: '0.10', load5: '0.10', load15: '0.10' },
      memory: { usedPercent: 40, usedMb: 400, totalMb: 1000 },
      disk: { usedPercent: 40, usedGb: 40, totalGb: 100 },
      running: 4,
      mongo: { connected: true },
      worker: { ready: true, connectedWorkers: 1 },
      queue: { waiting: 0, active: 0, delayed: 0, failed: 0, paused: false },
      webhooks,
    },
  });
}

describe('admin server page — GitHub webhooks', () => {
  it('flags a webhook secret mismatch when deliveries are being rejected', async () => {
    const html = await renderServerPage({
      isFailing: true,
      rejectedSinceAccepted: 238,
      lastAcceptedAt: null,
      lastRejectedAt: '2026-10-21T04:17:14Z',
    });
    assert.match(html, /238 deliveries rejected[\s\S]*webhook secret/);
  });

  it('reports healthy webhooks after an accepted delivery', async () => {
    const html = await renderServerPage({
      isFailing: false,
      rejectedSinceAccepted: 0,
      lastAcceptedAt: '2026-10-21T05:00:00Z',
      lastRejectedAt: null,
    });
    assert.match(html, /Receiving deliveries/);
  });

  it('says when webhook health cannot be read', async () => {
    const html = await renderServerPage(null);
    assert.match(html, /Webhook health could not be read/);
  });
});
