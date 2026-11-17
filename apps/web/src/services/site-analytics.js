import { env } from '../config/env.js';

/**
 * Paths that never carry third-party scripts or search indexing: auth URLs hold
 * one-time tokens, and app pages show project and repository names.
 */
export const PRIVATE_PATH_PREFIXES = Object.freeze([
  '/dashboard',
  '/projects',
  '/admin',
  '/auth',
  '/account',
  '/github',
]);

const FUNDING_CHOICES = 'https://fundingchoicesmessages.google.com';

const ANALYTICS_SOURCES = Object.freeze({
  script: ['https://www.googletagmanager.com', FUNDING_CHOICES],
  connect: [
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.googletagmanager.com',
    FUNDING_CHOICES,
  ],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
  frame: [FUNDING_CHOICES],
});

const NO_ANALYTICS_SOURCES = Object.freeze({ script: [], connect: [], img: [], frame: [] });

/**
 * GA4 settings for public pages, or null while it must stay off. The consent
 * tag is keyed to the AdSense publisher id, so analytics needs that id too.
 */
export function siteAnalytics({
  measurementId = env.GA4_MEASUREMENT_ID,
  consentReady = env.ANALYTICS_CONSENT_READY,
  clientId = env.ADSENSE_CLIENT_ID,
} = {}) {
  if (!measurementId || !consentReady || !clientId) {
    return null;
  }
  return { measurementId, publisherId: clientId.replace(/^ca-/, '') };
}

export function isPrivatePath(path) {
  return PRIVATE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** CSP sources to add only while analytics is on. */
export function analyticsCspSources(analytics) {
  return analytics ? ANALYTICS_SOURCES : NO_ANALYTICS_SOURCES;
}
