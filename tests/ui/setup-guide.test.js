import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';

const { renderFile } = ejs;

const partialPath = fileURLToPath(
  new URL('../../apps/web/src/views/partials/setup-guide.ejs', import.meta.url),
);
const base = '/projects/sample-app';

function guide(overrides = {}) {
  return {
    overviewHref: base,
    title: 'Complete the required setup',
    description: 'Set the missing variables: API_KEY.',
    tone: 'attention',
    doneCount: 3,
    total: 7,
    nextStepIndex: 1,
    pageStepIndex: 0,
    afterStep: null,
    milestones: [
      {
        key: 'check',
        label: 'App check passed',
        shortLabel: 'App check',
        done: true,
        href: `${base}/detection`,
      },
      {
        key: 'environment',
        label: 'Required variables set',
        shortLabel: 'Variables',
        done: false,
        href: `${base}/environment`,
      },
    ],
    nextAction: {
      label: 'Add variables',
      href: `${base}/environment`,
      method: 'GET',
      external: false,
      pendingLabel: null,
    },
    isOnNextStep: false,
    ...overrides,
  };
}

function renderGuide(setupGuide) {
  return renderFile(partialPath, { setupGuide, csrfToken: 'test-token' });
}

describe('setup guide partial', () => {
  it('links to the next setup step', async () => {
    const html = await renderGuide(guide());
    assert.match(
      html,
      /<a href="\/projects\/sample-app\/environment" class="button button--primary/,
    );
  });

  it('submits POST next actions through a CSRF-protected form', async () => {
    const html = await renderGuide(
      guide({
        nextAction: {
          label: 'Deploy my app',
          href: `${base}/deployments`,
          method: 'POST',
          external: false,
          pendingLabel: 'Deploying...',
        },
      }),
    );
    assert.match(
      html,
      /<form method="POST" action="\/projects\/sample-app\/deployments">[\s\S]*value="test-token"/,
    );
  });

  it('shows how many setup steps are complete', async () => {
    const html = await renderGuide(guide());
    assert.match(html, /3 of 7 complete/);
  });

  it('marks the step that belongs to the current page', async () => {
    const html = await renderGuide(guide());
    assert.match(html, /href="\/projects\/sample-app\/detection" aria-current="step"/);
  });

  it('points to the step after this one when the user is on the next step', async () => {
    const html = await renderGuide(
      guide({
        isOnNextStep: true,
        pageStepIndex: 1,
        afterStep: { label: 'Project approved', href: `${base}#submit-review` },
      }),
    );
    assert.match(html, /href="\/projects\/sample-app#submit-review">After this: Project approved/);
  });

  it('omits the next-step button when the user is already on that page', async () => {
    const html = await renderGuide(guide({ isOnNextStep: true, pageStepIndex: 1 }));
    assert.doesNotMatch(html, /button--primary/);
  });

  it('renders nothing without a setup guide', async () => {
    const html = await renderGuide(null);
    assert.equal(html.trim(), '');
  });
});
