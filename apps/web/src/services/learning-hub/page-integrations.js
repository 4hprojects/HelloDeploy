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

// Hosts Google lists for AdSense, its ad-quality checks, and the Privacy &
// messaging consent dialog that adsbygoogle.js loads for EEA/UK/CH visitors.
const ADSENSE_SOURCES = Object.freeze({
  script: [
    'https://*.googlesyndication.com',
    'https://*.googletagservices.com',
    'https://*.adtrafficquality.google',
    'https://fundingchoicesmessages.google.com',
  ],
  frame: [
    'https://*.googlesyndication.com',
    'https://*.doubleclick.net',
    'https://www.google.com',
    'https://*.adtrafficquality.google',
    'https://fundingchoicesmessages.google.com',
  ],
  connect: [
    'https://*.googlesyndication.com',
    'https://*.doubleclick.net',
    'https://*.adtrafficquality.google',
    'https://fundingchoicesmessages.google.com',
    'https://csi.gstatic.com',
  ],
  // Ad creatives load images from many advertiser CDNs that cannot be listed.
  img: ['https:'],
  // NOTE: the ad and consent scripts inject <style> elements and style
  // attributes, so inline styles are allowed while ads are on. This weakens
  // the style policy only; script-src stays nonce- and host-bound.
  style: ["'unsafe-inline'", 'https://fonts.googleapis.com'],
  font: ['https://fonts.gstatic.com'],
});

const NO_ADSENSE_SOURCES = Object.freeze({
  script: [],
  frame: [],
  connect: [],
  img: [],
  style: [],
  font: [],
});

// Google's fixed certification authority id for ads.txt entries.
const GOOGLE_ADS_TXT_CERT_ID = 'f08c47fec0942fa0';

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

/** CSP sources to add only while the owner's ad switch is on with an account id. */
export function adsenseCspSources({
  enabled = env.ADSENSE_ENABLED,
  clientId = env.ADSENSE_CLIENT_ID,
} = {}) {
  return enabled && clientId ? ADSENSE_SOURCES : NO_ADSENSE_SOURCES;
}

/**
 * The ads.txt body for the AdSense account, or null without one. Published as
 * soon as the account id is set so Google can verify the site during review.
 */
export function adsTxt(clientId = env.ADSENSE_CLIENT_ID) {
  if (!clientId) {
    return null;
  }
  return `google.com, ${clientId.replace(/^ca-/, '')}, DIRECT, ${GOOGLE_ADS_TXT_CERT_ID}\n`;
}
