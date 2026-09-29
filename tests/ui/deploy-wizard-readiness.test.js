import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const { renderFile } = ejs;
const readinessView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/wizard/readiness.ejs', import.meta.url),
);

const summary = {
  name: 'HelloUniversity',
  address: 'hellouniversity',
  branch: 'main',
  source: 'henson/hellouniversity',
  needsReview: false,
};

const passingCheck = {
  key: 'environment',
  label: 'Settings',
  status: 'PASS',
  message: 'Everything your website needs is in place.',
  action: null,
};

function renderReadiness(overrides = {}) {
  return renderFile(readinessView, {
    project: { slug: 'hellouniversity', name: 'HelloUniversity' },
    membership: { role: 'OWNER' },
    repository: { fullName: 'henson/hellouniversity' },
    wizardSteps: [
      { key: 'readiness', label: 'Publish', status: 'CURRENT', href: '#', position: 5 },
    ],
    deploymentDomain: 'hellodeploy.online',
    readiness: {
      isReady: overrides.isReady ?? true,
      blocking: overrides.blocking ?? [],
      checks: overrides.checks ?? [passingCheck],
      summary: { ...summary, ...(overrides.summary ?? {}) },
    },
    csrfToken: 'placeholder',
    ...(overrides.formError ? { formError: overrides.formError } : {}),
  });
}

const blockingCheck = {
  key: 'environment',
  label: 'Settings',
  status: 'BLOCKING',
  message: 'DATABASE_URL is required before this website can start.',
  action: { label: 'Add DATABASE_URL', href: '/projects/hellouniversity/setup/environment' },
};

describe('ready to publish', () => {
  it('confirms the website is ready', async () => {
    assert.match(await renderReadiness(), /Ready to publish/);
  });

  it('shows the full address the visitor will use', async () => {
    assert.match(await renderReadiness(), /hellouniversity\.hellodeploy\.online/);
  });

  it('names the branch being published', async () => {
    assert.match(await renderReadiness(), /main/);
  });

  it('offers to publish', async () => {
    assert.match(await renderReadiness(), /Publish website/);
  });

  it('asks for review instead when the website has never been approved', async () => {
    const html = await renderReadiness({ summary: { needsReview: true } });
    assert.match(html, /Send for review/);
  });

  it('explains why review is needed rather than just blocking', async () => {
    const html = await renderReadiness({ summary: { needsReview: true } });
    assert.match(html, /needs a quick review/);
  });
});

describe('not yet ready to publish', () => {
  it('says so without alarming language', async () => {
    const html = await renderReadiness({ isReady: false, checks: [blockingCheck] });
    assert.match(html, /Almost ready/);
  });

  it('offers no way to publish', async () => {
    const html = await renderReadiness({ isReady: false, checks: [blockingCheck] });
    assert.doesNotMatch(html, /Publish website/);
  });

  it('links straight to the field that fixes the problem', async () => {
    const html = await renderReadiness({ isReady: false, checks: [blockingCheck] });
    assert.match(html, /href="\/projects\/hellouniversity\/setup\/environment"/);
  });

  it('states the problem in the owner’s terms', async () => {
    const html = await renderReadiness({ isReady: false, checks: [blockingCheck] });
    assert.match(html, /DATABASE_URL is required before this website can start/);
  });

  it('labels each check for screen readers, not by glyph alone', async () => {
    const html = await renderReadiness({ isReady: false, checks: [blockingCheck] });
    assert.match(html, /Needs attention:/);
  });

  it('shows a submission error when publishing was refused', async () => {
    const html = await renderReadiness({
      isReady: false,
      checks: [blockingCheck],
      formError: 'Some things still need your attention before this website can be published.',
    });

    assert.match(html, /still need your attention/);
  });
});
