import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const { renderFile } = ejs;

const wizardView = (name) =>
  fileURLToPath(new URL(`../../apps/web/src/views/pages/projects/wizard/${name}`, import.meta.url));

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);
const tokensCss = await readFile(
  new URL('../../apps/web/public/css/tokens.css', import.meta.url),
  'utf8',
);

const WIZARD_VIEWS = [
  'source.ejs',
  'repository.ejs',
  'analyze.ejs',
  'identity.ejs',
  'environment.ejs',
  'readiness.ejs',
  'published.ejs',
];

const steps = [
  { key: 'repository', label: 'Choose your website', status: 'COMPLETE', href: '#', position: 1 },
  { key: 'analyze', label: 'Check your project', status: 'CURRENT', href: '#', position: 2 },
  { key: 'identity', label: 'Name your website', status: 'UPCOMING', href: '#', position: 3 },
];

const sources = [
  {
    key: 'github',
    label: 'GitHub',
    description: 'd',
    icon: 'repository',
    href: '/projects/new/github',
    available: true,
  },
];

/** Locals broad enough that any wizard view renders. */
const locals = {
  project: { slug: 'hellouniversity', name: 'HelloUniversity', buildConfiguration: {} },
  membership: { role: 'OWNER' },
  repository: { fullName: 'henson/hellouniversity', defaultBranch: 'main' },
  wizardSteps: steps,
  sources,
  repos: [{ fullName: 'henson/hellouniversity', defaultBranch: 'main', private: false }],
  githubConfigured: true,
  isGithubConnected: true,
  installUrl: 'https://github.com/apps/x/installations/new',
  loadError: null,
  detection: { status: 'READY', issues: [], packageManager: 'NPM' },
  fieldConfidence: {},
  findings: [{ key: 'runtime', label: 'A Next.js website detected', status: 'OK' }],
  needsReview: false,
  hasRun: true,
  isReady: true,
  deploymentDomain: 'hellodeploy.online',
  values: { name: 'HelloUniversity', address: 'hellouniversity', value: '' },
  errors: {},
  rows: [],
  missingRequired: [],
  hasDetectedKeys: false,
  readiness: {
    isReady: true,
    blocking: [],
    checks: [
      { key: 'environment', label: 'Settings', status: 'PASS', message: 'All good.', action: null },
    ],
    summary: {
      name: 'HelloUniversity',
      address: 'hellouniversity',
      branch: 'main',
      source: 'henson/hellouniversity',
      needsReview: false,
    },
  },
  appUrl: 'https://hellouniversity.hellodeploy.online',
  autoPublishEnabled: true,
  branch: 'main',
  csrfToken: 'placeholder',
  uiMode: 'SIMPLE',
};

describe('every guided step is reachable without a mouse', () => {
  for (const name of WIZARD_VIEWS) {
    it(`renders ${name} without a click-only control`, async () => {
      const html = await renderFile(wizardView(name), locals);

      // A div or span carrying onclick cannot be reached by keyboard.
      assert.doesNotMatch(html, /<(?:div|span)[^>]*onclick=/i);
    });
  }
});

describe('every guided step labels its inputs', () => {
  for (const name of WIZARD_VIEWS) {
    it(`binds every input in ${name} to a label`, async () => {
      const html = await renderFile(wizardView(name), locals);
      const ids = [...html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)].map(
        (m) => m[1],
      );
      const labelled = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
      const unlabelled = ids.filter((id) => !labelled.has(id));

      assert.deepEqual(unlabelled, []);
    });
  }
});

describe('errors are tied to the field they belong to', () => {
  it('points the name field at its error', async () => {
    const html = await renderFile(wizardView('identity.ejs'), {
      ...locals,
      errors: { name: 'Give your website a name.' },
    });

    assert.match(html, /aria-describedby="name-error"/);
  });

  it('gives that error an id to point at', async () => {
    const html = await renderFile(wizardView('identity.ejs'), {
      ...locals,
      errors: { name: 'Give your website a name.' },
    });

    assert.match(html, /id="name-error"/);
  });

  it('announces a field error to a screen reader', async () => {
    const html = await renderFile(wizardView('identity.ejs'), {
      ...locals,
      errors: { name: 'Give your website a name.' },
    });

    assert.match(html, /id="name-error"[^>]*role="alert"/);
  });

  it('points the value field at its error', async () => {
    const html = await renderFile(wizardView('environment.ejs'), {
      ...locals,
      errors: { value: 'Enter a value.' },
    });

    assert.match(html, /aria-describedby="env-value-error"/);
  });
});

describe('status is never carried by colour alone', () => {
  it('names the state of each setup step', async () => {
    const html = await renderFile(wizardView('analyze.ejs'), locals);
    assert.match(html, /class="sr-only"/);
  });

  it('names each readiness check state', async () => {
    const html = await renderFile(wizardView('readiness.ejs'), locals);
    assert.match(html, /Ready:/);
  });

  it('names whether automatic publishing is on', async () => {
    const html = await renderFile(wizardView('published.ejs'), locals);
    assert.match(html, /<span class="sr-only">On:<\/span>/);
  });
});

describe('live regions announce what changed', () => {
  it('announces address availability as it is checked', async () => {
    const html = await renderFile(wizardView('identity.ejs'), locals);
    assert.match(html, /aria-live="polite"/);
  });

  it('announces which settings are still missing', async () => {
    const html = await renderFile(wizardView('environment.ejs'), {
      ...locals,
      missingRequired: ['DATABASE_URL'],
      rows: [
        {
          name: 'DATABASE_URL',
          category: 'REQUIRED_USER_INPUT',
          isStored: false,
          isBlocking: true,
          note: null,
        },
      ],
      hasDetectedKeys: true,
    });

    assert.match(html, /role="status"/);
  });
});

describe('motion and contrast preferences are respected', () => {
  it('shortens transitions when the viewer asks for less motion', () => {
    assert.match(tokensCss, /@media \(prefers-reduced-motion: reduce\)/);
  });

  it('never removes a focus outline without putting something visible back', () => {
    // outline: none is fine when the rule supplies its own ring; it is only a
    // problem when focus becomes invisible.
    const focusRules = [...componentsCss.matchAll(/([^{}]*:focus[^{}]*)\{([^}]*)\}/g)];
    const invisible = focusRules
      .filter(([, , body]) => /outline:\s*none/.test(body))
      .filter(([, , body]) => !/box-shadow|border-color|outline-offset/.test(body))
      .map(([, selector]) => selector.trim());

    assert.deepEqual(invisible, []);
  });
});

describe('the guided flow works on a phone', () => {
  it('stacks the website header and its actions', () => {
    assert.match(
      componentsCss,
      /@media \(max-width: 48rem\)[\s\S]*?\.website-header \{[\s\S]*?flex-direction: column/,
    );
  });

  it('gives header actions a full-width touch target', () => {
    assert.match(componentsCss, /\.website-header__actions form button \{\s*width: 100%/);
  });

  it('moves the publish timestamp off the stage label', () => {
    assert.match(componentsCss, /\.deploy-progress__time \{\s*grid-column: 2/);
  });

  it('stacks a readiness check above its action', () => {
    assert.match(componentsCss, /\.readiness-check \{\s*flex-wrap: wrap/);
  });

  it('keeps setup-step wording for the current step only', () => {
    assert.match(
      componentsCss,
      /\.wizard-progress__step:not\(\.wizard-progress__step--current\) \.wizard-progress__label/,
    );
  });

  it('drops the overview cards to one column on a narrow phone', () => {
    assert.match(
      componentsCss,
      /@media \(max-width: 30rem\)[\s\S]*?\.overview-cards \{\s*grid-template-columns: 1fr/,
    );
  });

  it('keeps touch targets at least 44px in the controls it added', () => {
    assert.match(componentsCss, /\.publish-choice__option \{[\s\S]*?min-height: 44px/);
  });
});
