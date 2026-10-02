import { asyncHandler } from '../utils/async-handler.js';
import { recordProductEvent } from '../services/product-analytics.service.js';

const METRICS = new Set(['LCP', 'INP', 'CLS']);
const PAGES = new Set([
  'landing',
  'auth',
  'dashboard',
  'projects',
  'project',
  'deployment',
  'admin',
]);

export const postWebVital = asyncHandler(async (req, res) => {
  const { metric, value, page } = req.body ?? {};
  if (!METRICS.has(metric) || !Number.isFinite(value) || value < 0 || value > 60_000) {
    return res
      .status(400)
      .json({ error: { code: 'INVALID_METRIC', message: 'Invalid Web Vital.' } });
  }
  await recordProductEvent({
    name: 'web_vital',
    userId: req.session?.user?.id ?? null,
    properties: {
      metric,
      value,
      viewport:
        req.get('Sec-CH-UA-Mobile') === '?1' || Number(req.body.viewportWidth) < 768
          ? 'mobile'
          : 'desktop',
      page: PAGES.has(page) ? page : undefined,
    },
  });
  res.status(202).json({ accepted: true });
});
