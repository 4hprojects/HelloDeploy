import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const deploymentService = await readFile(
  new URL('../../apps/web/src/services/deployment.service.js', import.meta.url),
  'utf8',
);
const domainService = await readFile(
  new URL('../../apps/web/src/services/domain.service.js', import.meta.url),
  'utf8',
);
const domainController = await readFile(
  new URL('../../apps/web/src/controllers/domain.controller.js', import.meta.url),
  'utf8',
);

describe('operational error copy', () => {
  it('gives action-oriented deployment failure guidance', () => {
    assert.match(deploymentService, /check Redis and worker health, then try again/);
    assert.match(deploymentService, /Reconnect the GitHub App or update installation access/);
    assert.match(deploymentService, /cancel it from Deployments before starting another/);
  });

  it('gives action-oriented domain and DNS guidance', () => {
    assert.match(domainService, /Domain verification queue is unavailable/);
    assert.match(
      domainService,
      /DNS is already verified and this domain is awaiting admin approval/,
    );
    assert.match(domainService, /Deploy a healthy release before activating this domain/);
    assert.match(domainController, /DNS can take 1-30 minutes to propagate/);
    assert.match(domainController, /confirm the TXT record name\/value and try again/);
  });
});
