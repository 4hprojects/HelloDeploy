import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const { renderFile } = ejs;

const sourceView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/wizard/source.ejs', import.meta.url),
);
const repositoryView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/wizard/repository.ejs', import.meta.url),
);

const clientScript = await readFile(
  new URL('../../apps/web/public/js/app.js', import.meta.url),
  'utf8',
);

const connectService = await readFile(
  new URL('../../apps/web/src/services/repository-connect.service.js', import.meta.url),
  'utf8',
);

const sources = [
  {
    key: 'github',
    label: 'GitHub',
    description: 'Connect a project you already keep on GitHub.',
    icon: 'repository',
    href: '/projects/new/github',
    available: true,
  },
  {
    key: 'upload',
    label: 'Upload a project',
    description: 'Send a folder or ZIP straight from your computer.',
    icon: 'projects',
    href: null,
    available: false,
  },
];

const repos = [
  { fullName: 'henson/hellouniversity', defaultBranch: 'main', private: false },
  { fullName: 'henson/portfolio', defaultBranch: 'develop', private: true },
];

const renderSource = () => renderFile(sourceView, { sources });

const renderRepository = (overrides = {}) =>
  renderFile(repositoryView, {
    sources,
    repos: overrides.repos ?? repos,
    githubConfigured: overrides.githubConfigured ?? true,
    isGithubConnected: overrides.isGithubConnected ?? true,
    installUrl: 'https://github.com/apps/hellodeploy/installations/new',
    loadError: overrides.loadError ?? null,
    csrfToken: 'placeholder',
  });

describe('deploy wizard — where is your website', () => {
  it('asks the question in plain language', async () => {
    assert.match(await renderSource(), /Where is your website\?/);
  });

  it('offers the GitHub path', async () => {
    assert.match(await renderSource(), /href="\/projects\/new\/github"/);
  });

  it('shows a not-yet-available source as pending rather than hiding it', async () => {
    assert.match(await renderSource(), /Not yet available/);
  });

  it('gives a not-yet-available source no link to follow', async () => {
    const html = await renderSource();
    assert.doesNotMatch(html, /href="null"/);
  });

  it('keeps a manual route for a repository GitHub cannot reach', async () => {
    assert.match(await renderSource(), /\/projects\/new\/manual/);
  });

  it('mentions no runtime, port or proxy', async () => {
    assert.doesNotMatch(await renderSource(), /runtime|port|nginx|proxy|container/i);
  });
});

describe('deploy wizard — choose your website', () => {
  it('lets the owner search their projects', async () => {
    assert.match(await renderRepository(), /data-repo-search/);
  });

  it('lists every available project', async () => {
    const html = await renderRepository();
    assert.equal((html.match(/data-repo-item/g) ?? []).length, repos.length);
  });

  it('preselects the first project so Continue always has a target', async () => {
    assert.match(await renderRepository(), /value="henson\/hellouniversity"[\s\S]{0,240}checked/);
  });

  it('keeps the branch control behind advanced options', async () => {
    assert.match(await renderRepository(), /Advanced options[\s\S]*?name="branch"/);
  });

  it('says the default branch is used when the field is left alone', async () => {
    assert.match(await renderRepository(), /default branch/i);
  });

  it('asks the owner to connect GitHub before listing anything', async () => {
    const html = await renderRepository({ isGithubConnected: false });
    assert.match(html, /Connect GitHub first/);
  });

  it('shows no project form until GitHub is connected', async () => {
    const html = await renderRepository({ isGithubConnected: false });
    assert.doesNotMatch(html, /data-repo-picker/);
  });

  it('explains an empty repository list as a permissions choice', async () => {
    const html = await renderRepository({ repos: [] });
    assert.match(html, /Grant it access to at least/);
  });

  it('surfaces a load failure with a way forward', async () => {
    const html = await renderRepository({ loadError: 'HelloDeploy could not load your projects.' });
    assert.match(html, /Review which repositories HelloDeploy can see/);
  });
});

describe('deploy wizard — repository picker behaviour', () => {
  it('registers the picker on page load', () => {
    assert.match(clientScript, /initRepositoryPicker\(\);/);
  });

  it('deselects a project the search has hidden', () => {
    assert.match(clientScript, /selected\.checked = false/);
  });
});

describe('deploy wizard — connect failures speak plainly', () => {
  it('never shows GitHub’s raw permission error', () => {
    assert.doesNotMatch(connectService, /resource inaccessible by integration/);
  });

  it('tells the owner how to fix missing access', () => {
    assert.match(connectService, /Reconnect GitHub or update which repositories it can see/);
  });

  it('names the fix when a branch has gone', () => {
    assert.match(connectService, /Choose another branch/);
  });

  it('trusts only the installation listing for authorization', () => {
    assert.match(
      connectService,
      /repos\.find\(\(candidate\) => candidate\.fullName === fullName\)/,
    );
  });
});
