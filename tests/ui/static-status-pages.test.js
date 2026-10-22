import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const siteNotFound = await read('apps/web/public/site-not-found.html');
const serviceUnavailable = await read('apps/web/public/service-unavailable.html');
const defaultSite = await read('infrastructure/nginx/default-site.conf');

// nginx serves these on any hostname, even while the web app is down, so each
// page must stand alone: no request may reach the catch-all again.
const EXTERNAL_RESOURCE = /<(?:img|script)[^>]+src="https?:|<link[^>]+rel="stylesheet"|@import/;

describe('site-not-found page', () => {
  it('carries the logo inline', () => {
    assert.match(siteNotFound, /src="data:image\/png;base64,/);
  });

  it('loads no external resources', () => {
    assert.doesNotMatch(siteNotFound, EXTERNAL_RESOURCE);
  });

  it('is kept out of search results', () => {
    assert.match(siteNotFound, /<meta name="robots" content="noindex"/);
  });

  it('states the status', () => {
    assert.match(siteNotFound, /404 · Site not found/);
  });

  it('invites visitors to deploy their own app', () => {
    assert.match(siteNotFound, /href="https:\/\/hellodeploy\.online\/auth\/create-account"/);
  });

  it('writes the requested hostname as text, never as markup', () => {
    assert.match(siteNotFound, /\.textContent = (window\.)?location\.hostname/);
  });

  it('never assigns markup from the page address', () => {
    assert.doesNotMatch(siteNotFound, /innerHTML/);
  });
});

describe('service-unavailable page', () => {
  it('carries the logo inline', () => {
    assert.match(serviceUnavailable, /src="data:image\/png;base64,/);
  });

  it('loads no external resources', () => {
    assert.doesNotMatch(serviceUnavailable, EXTERNAL_RESOURCE);
  });

  it('states the status', () => {
    assert.match(serviceUnavailable, /503 · Temporarily unavailable/);
  });
});

describe('nginx default site', () => {
  it('answers unknown hostnames with the site-not-found page', () => {
    assert.match(defaultSite, /error_page 404 \/site-not-found\.html;/);
  });

  it('serves the page only as an internal error page', () => {
    assert.match(defaultSite, /location = \/site-not-found\.html \{\s*internal;\s*\}/);
  });
});
