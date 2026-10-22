import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const deploymentsPage = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployments.ejs', import.meta.url),
  'utf8',
);

// Every row repeats the same actions; a screen reader's link and button lists
// would otherwise read "Logs, Logs, Logs" with no way to tell rows apart.
const ROW_CONTEXT = '<span class="sr-only"> for deployment #<%= d.sequenceNumber %></span>';

describe('deployment row actions name their deployment', () => {
  for (const label of ['Logs', 'Cancel', 'Retry same commit', 'Retry latest']) {
    it(`labels "${label}" with the deployment number`, () => {
      assert.ok(deploymentsPage.includes(`>${label}${ROW_CONTEXT}<`));
    });
  }
});

const deploymentDetail = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
  'utf8',
);
const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

// A build streams hundreds of lines; as a live region the log would be read aloud
// line by line. Status changes are announced by the "Live" status instead.
describe('deployment log viewer for screen readers', () => {
  it('does not announce every streamed log line', () => {
    assert.doesNotMatch(deploymentDetail, /id="log-output"\s+aria-live/);
  });

  it('is a named region keyboard users can scroll', () => {
    assert.match(
      deploymentDetail,
      /id="log-output"\s+role="region"\s+aria-label="Deployment logs"\s+tabindex="0"/,
    );
  });
});

describe('deployments list announcements', () => {
  it('has a polite live region for finished deployments', () => {
    assert.match(deploymentsPage, /class="sr-only" aria-live="polite" data-deployment-list-live/);
  });

  it('announces a deployment when it finishes', () => {
    assert.match(
      appJs,
      /listLive\.textContent = `Deployment \$\{number\}: \$\{deployment\.presentation\.label\}`/,
    );
  });
});
