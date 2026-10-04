import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const template = await readFile(
  new URL('../../apps/web/src/pwa/service-worker.js', import.meta.url),
  'utf8',
);
const origin = 'https://hellodeploy.test';
function harness({ offline = false, redirect = false } = {}) {
  const handlers = {};
  const stores = new Map();
  const fetched = [];
  let claimed = 0;
  let skipped = 0;
  const self = {
    location: { origin },
    addEventListener: (name, callback) => {
      handlers[name] = callback;
    },
    clients: {
      claim: async () => {
        claimed++;
      },
    },
    skipWaiting: async () => {
      skipped++;
    },
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) {
        stores.set(name, new Map());
      }
      const data = stores.get(name);
      return {
        match: async (url) => data.get(url)?.clone(),
        put: async (url, response) => data.set(url, response.clone()),
      };
    },
  };
  const fetch = async (request, options) => {
    const url = typeof request === 'string' ? request : request.url;
    fetched.push({ url, options });
    if (offline) {
      throw new Error('offline');
    }
    const response = new Response(
      url.endsWith('offline.html') ? 'offline fallback' : 'network response',
    );
    if (redirect) {
      Object.defineProperty(response, 'redirected', { value: true });
    }
    return response;
  };
  vm.runInNewContext(
    template.replace(
      '/* PRECACHE_CONFIG */ null',
      JSON.stringify({ version: 'test', assets: ['/assets-dist/app.hash.js', '/offline.html'] }),
    ),
    { self, caches, fetch, URL, Response, Set },
  );
  async function lifecycle(name, data) {
    let completion;
    handlers[name]({
      data,
      waitUntil: (promise) => {
        completion = promise;
      },
    });
    await completion;
  }
  async function request(path, { method = 'GET', mode = 'cors' } = {}) {
    let response;
    handlers.fetch({
      request: { url: new URL(path, origin).href, method, mode },
      respondWith: (promise) => {
        response = promise;
      },
    });
    return response;
  }
  return {
    lifecycle,
    request,
    fetched,
    stores,
    setOffline: () => {
      offline = true;
    },
    claimed: () => claimed,
    skipped: () => skipped,
  };
}

test('precache uses only explicit public assets without credentials; static hits work offline', async () => {
  const sw = harness();
  await sw.lifecycle('install');
  assert.equal(sw.fetched.length, 2);
  assert.ok(sw.fetched.every(({ options }) => options.credentials === 'omit'));
  assert.equal(sw.skipped(), 0, 'installation must not force activation');
  sw.setOffline();
  assert.equal(await (await sw.request('/assets-dist/app.hash.js')).text(), 'network response');
});

test('private requests, query variants, mutations, and other origins never enter cache handling', async () => {
  const sw = harness();
  await sw.lifecycle('install');
  for (const path of [
    '/api/status',
    '/auth/sign-in',
    '/projects/a/environment',
    '/projects/a/logs',
    '/dashboard',
    '/docs',
    '/assets-dist/app.hash.js?private=1',
    'https://other.test/assets-dist/app.hash.js',
  ]) {
    assert.equal(await sw.request(path), undefined, path);
  }
  assert.equal(await sw.request('/assets-dist/app.hash.js', { method: 'POST' }), undefined);
  assert.equal(sw.fetched.length, 2);
});

test('online documents remain uncached; failed navigation gets only the anonymous fallback', async () => {
  const sw = harness();
  await sw.lifecycle('install');
  assert.equal(
    await (await sw.request('/projects/private', { mode: 'navigate' })).text(),
    'network response',
  );
  assert.equal(sw.stores.get('hellodeploy-static-test').size, 2);
  sw.setOffline();
  assert.equal(
    await (await sw.request('/projects/private', { mode: 'navigate' })).text(),
    'offline fallback',
  );
  assert.equal(await sw.request('/api/status'), undefined);
});

test('activation cleans only owned old caches and claims clients', async () => {
  const sw = harness();
  sw.stores.set('another-app-cache', new Map());
  sw.stores.set('hellodeploy-static-old', new Map());
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.deepEqual([...sw.stores.keys()], ['another-app-cache', 'hellodeploy-static-test']);
  assert.equal(sw.claimed(), 1);
});

test('only explicit update messages activate a waiting worker', async () => {
  const sw = harness();
  await sw.lifecycle('message', { type: 'OTHER' });
  assert.equal(sw.skipped(), 0);
  await sw.lifecycle('message', { type: 'ACTIVATE_UPDATE' });
  assert.equal(sw.skipped(), 1);
});

test('redirected precache responses fail installation rather than caching login HTML', async () => {
  const sw = harness({ redirect: true });
  await assert.rejects(sw.lifecycle('install'), /Unable to precache/);
  assert.equal(sw.stores.get('hellodeploy-static-test').size, 0);
});
