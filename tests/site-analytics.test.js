import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { after, before, describe, it } from 'node:test';

import ejs from 'ejs';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['analytics', 'test', 'session', 'value'].join('-');
process.env.PLATFORM_DOMAIN = 'example.test';

const { startTestDb, stopTestDb } = await import('./helpers/worker-db.js');
const { createApp } = await import('../apps/web/src/app.js');
const { analyticsCspSources, isPrivatePath, siteAnalytics } =
  await import('../apps/web/src/services/site-analytics.js');

const ANALYTICS = { measurementId: 'G-ABC1234', publisherId: 'pub-1234567890123456' };
const viewPath = (name) =>
  fileURLToPath(new URL(`../apps/web/src/views/partials/${name}.ejs`, import.meta.url));

describe('site analytics gating', () => {
  const complete = {
    measurementId: 'G-ABC1234',
    consentReady: true,
    clientId: 'ca-pub-1234567890123456',
  };

  it('stays off without confirmed consent handling', () => {
    assert.equal(siteAnalytics({ ...complete, consentReady: false }), null);
  });

  it('stays off without a measurement id', () => {
    assert.equal(siteAnalytics({ ...complete, measurementId: '' }), null);
  });

  it('stays off without the publisher id the consent tag needs', () => {
    assert.equal(siteAnalytics({ ...complete, clientId: '' }), null);
  });

  it('derives the consent tag publisher id from the AdSense client id', () => {
    assert.deepEqual(siteAnalytics(complete), ANALYTICS);
  });

  it('treats auth URLs as private', () => {
    assert.equal(isPrivatePath('/auth/verify-email'), true);
  });

  it('treats project pages as private', () => {
    assert.equal(isPrivatePath('/projects/abc'), true);
  });

  it('treats blog articles as public', () => {
    assert.equal(isPrivatePath('/blog/some-guide'), false);
  });

  it('does not mistake a public path that shares a prefix for a private one', () => {
    assert.equal(isPrivatePath('/authors'), false);
  });

  it('adds no CSP sources while analytics is off', () => {
    assert.deepEqual(analyticsCspSources(null).frame, []);
  });

  it('allows the consent message frame while analytics is on', () => {
    assert.ok(
      new Set(analyticsCspSources(ANALYTICS).frame).has(
        'https://fundingchoicesmessages.google.com',
      ),
    );
  });
});

describe('site analytics on pages', () => {
  let on;
  let off;
  before(async () => {
    await startTestDb();
    const start = (analytics) => {
      const app = createApp({ readinessCheck: async () => ({ ready: true }), analytics });
      const server = app.listen(0);
      return { app, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
    };
    on = start(ANALYTICS);
    off = start(null);
  });
  after(async () => {
    for (const { app, server } of [on, off]) {
      server.close();
      await app.locals.drainSessionWrites?.();
    }
    await stopTestDb();
  });

  const html = async (target, path) => (await fetch(`${target.baseUrl}${path}`)).text();

  it('tags a public page', async () => {
    assert.match(await html(on, '/features'), /googletagmanager\.com\/gtag\/js\?id=G-ABC1234/);
  });

  it('loads the consent tag on a public page', async () => {
    assert.match(
      await html(on, '/features'),
      /fundingchoicesmessages\.google\.com\/i\/pub-1234567890123456\?ers=1/,
    );
  });

  it('loads no Google script on the sign-in page', async () => {
    assert.doesNotMatch(await html(on, '/auth/sign-in'), /googletagmanager|fundingchoices/);
  });

  it('loads no Google script while analytics is off', async () => {
    assert.doesNotMatch(await html(off, '/features'), /googletagmanager|fundingchoices/);
  });

  it('offers the privacy settings control on a measured page', async () => {
    assert.match(await html(on, '/features'), /data-privacy-settings/);
  });

  it('offers the analytics opt-out on the cookie policy', async () => {
    assert.match(await html(on, '/cookies'), /data-analytics-toggle /);
  });

  it('allows the analytics hosts in the CSP while analytics is on', async () => {
    const res = await fetch(`${on.baseUrl}/features`);
    assert.match(
      res.headers.get('content-security-policy'),
      /https:\/\/www\.googletagmanager\.com/,
    );
  });
});

describe('site analytics tag', () => {
  // Runs the tag's inline script the way a browser would and returns what it
  // queued for gtag.js.
  async function runTag({ href, referrer = '', optedOut = false, locals = {} }) {
    const tag = await ejs.renderFile(viewPath('analytics'), {
      analytics: ANALYTICS,
      cspNonce: 'nonce',
      title: 'Features',
      ...locals,
    });
    const script = tag.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)[1];
    const context = {
      URL,
      URLSearchParams,
      location: new URL(href),
      document: { referrer },
      localStorage: { getItem: () => (optedOut ? '1' : null) },
    };
    context.window = context;
    vm.runInNewContext(script, context);
    return {
      // Copied out so assertions compare arrays from this realm, not the sandbox's.
      calls: Array.from(context.dataLayer, (args) => Array.from(args)),
      disabled: context['ga-disable-G-ABC1234'] === true,
    };
  }

  const configOf = (calls) => calls.find(([command]) => command === 'config')[2];

  it('sets the consent defaults before configuring GA4', async () => {
    const { calls } = await runTag({ href: 'https://hellodeploy.online/features' });
    assert.deepEqual(
      calls.map(([command]) => command),
      ['consent', 'consent', 'js', 'config'],
    );
  });

  it('denies analytics storage by default in the EEA, UK, and Switzerland', async () => {
    const { calls } = await runTag({ href: 'https://hellodeploy.online/features' });
    const regional = calls.find(
      ([command, , settings]) => command === 'consent' && settings.region,
    );
    assert.equal(regional[2].analytics_storage, 'denied');
  });

  it('includes the UK and Switzerland in the consent regions', async () => {
    const { calls } = await runTag({ href: 'https://hellodeploy.online/features' });
    const regional = calls.find(
      ([command, , settings]) => command === 'consent' && settings.region,
    );
    assert.deepEqual(
      [...regional[2].region].filter((code) => code === 'GB' || code === 'CH'),
      ['GB', 'CH'],
    );
  });

  it('keeps campaign tags but drops other query parameters from the page address', async () => {
    const { calls } = await runTag({
      href: 'https://hellodeploy.online/blog?q=my-secret&utm_source=newsletter',
    });
    assert.equal(
      configOf(calls).page_location,
      'https://hellodeploy.online/blog?utm_source=newsletter',
    );
  });

  it('drops the query from a same-site referrer', async () => {
    const { calls } = await runTag({
      href: 'https://hellodeploy.online/blog/guide',
      referrer: 'https://hellodeploy.online/blog?q=my-secret',
    });
    assert.equal(configOf(calls).page_referrer, 'https://hellodeploy.online/blog');
  });

  it('turns Google signals off', async () => {
    const { calls } = await runTag({ href: 'https://hellodeploy.online/features' });
    assert.equal(configOf(calls).allow_google_signals, false);
  });

  it('sends a fixed title instead of a reader search query', async () => {
    const { calls } = await runTag({
      href: 'https://hellodeploy.online/blog?q=my-secret',
      locals: { title: 'Search: my-secret', analyticsTitle: 'Learning Hub search' },
    });
    assert.equal(configOf(calls).page_title, 'Learning Hub search');
  });

  it('disables GA4 on a browser that opted out', async () => {
    const { disabled } = await runTag({
      href: 'https://hellodeploy.online/features',
      optedOut: true,
    });
    assert.equal(disabled, true);
  });
});
