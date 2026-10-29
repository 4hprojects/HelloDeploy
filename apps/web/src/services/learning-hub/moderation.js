import { logger } from '@hellodeploy/observability';

export const MODERATION_POLICY_VERSION = 'lh-2026-10-29';
const DEFAULT_TIMEOUT_MS = 5_000;
const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';

// Scores between these and the provider's own "flagged" threshold are held
// back for revision instead of being published on a borderline call.
const UNCERTAIN_SCORE = 0.3;
const SCREENED_CATEGORIES = [
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'violence',
  'sexual',
  'sexual/minors',
  'self-harm',
  'illicit',
];

/**
 * A replaceable contextual moderation provider. `moderate` resolves to
 * `{ decision: 'safe' | 'unsafe' | 'uncertain' | 'unavailable', categories }`
 * and never throws. Only `safe` may publish.
 */
export function createModerator({
  provider,
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  classify,
}) {
  if (provider === 'openai-moderation' && apiKey) {
    return {
      provider,
      isConfigured: true,
      moderate: (text) =>
        guard(provider, () => openAiModeration({ text, apiKey, fetchImpl, timeoutMs })),
    };
  }
  // Tests supply their own classifier; it is never selected by configuration.
  if (provider === 'injected' && typeof classify === 'function') {
    return {
      provider,
      isConfigured: true,
      moderate: (text) => guard(provider, () => withTimeout(classify(text), timeoutMs)),
    };
  }
  return {
    provider: 'none',
    isConfigured: false,
    moderate: async () => ({ decision: 'unavailable', categories: [] }),
  };
}

async function guard(provider, run) {
  try {
    return await run();
  } catch (error) {
    logger.error('[learning-hub] Moderation provider failed; submission held', {
      provider,
      error: error.name === 'TimeoutError' ? 'timeout' : error.message,
    });
    return { decision: 'unavailable', categories: [] };
  }
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error('Moderation timed out'), { name: 'TimeoutError' })),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function openAiModeration({ text, apiKey, fetchImpl, timeoutMs }) {
  const response = await fetchImpl(OPENAI_MODERATION_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Moderation HTTP ${response.status}`);
  }
  const result = (await response.json())?.results?.[0];
  if (!result || typeof result.flagged !== 'boolean') {
    throw new Error('Moderation response malformed');
  }
  const flagged = SCREENED_CATEGORIES.filter((category) => result.categories?.[category]);
  if (result.flagged || flagged.length > 0) {
    return { decision: 'unsafe', categories: flagged };
  }
  const borderline = SCREENED_CATEGORIES.filter(
    (category) => (result.category_scores?.[category] ?? 0) >= UNCERTAIN_SCORE,
  );
  if (borderline.length > 0) {
    return { decision: 'uncertain', categories: borderline };
  }
  return { decision: 'safe', categories: [] };
}
