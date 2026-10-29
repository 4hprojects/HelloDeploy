import { env } from '../../config/env.js';

const GA4_SOURCES = Object.freeze({
  script: ['https://www.googletagmanager.com'],
  connect: [
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.googletagmanager.com',
  ],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
});

/** GA4 for Learning Hub pages, or null while it must stay off. */
export function learningHubAnalytics({
  measurementId = env.GA4_MEASUREMENT_ID,
  consentReady = env.LEARNING_HUB_ANALYTICS_CONSENT_READY,
} = {}) {
  return measurementId && consentReady ? { measurementId } : null;
}

/** CSP sources to add only while GA4 is active. */
export function analyticsCspSources(analytics = learningHubAnalytics()) {
  return analytics ? GA4_SOURCES : { script: [], connect: [], img: [] };
}

/**
 * The article ad slot, or null. Ads need the owner's switch, approved account
 * identifiers, and an article marked ad-eligible; a page that shows guest
 * comments never carries ads, because that content is not reviewed first.
 */
export function articleAdSlot(
  { article, discussionVisible },
  {
    enabled = env.ADSENSE_ENABLED,
    clientId = env.ADSENSE_CLIENT_ID,
    slotId = env.ADSENSE_ARTICLE_SLOT_ID,
  } = {},
) {
  if (!enabled || !clientId || !slotId || !article.adEligible || discussionVisible) {
    return null;
  }
  return { clientId, slotId };
}
