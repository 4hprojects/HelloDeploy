import { ProductEvent, PRODUCT_EVENT_NAMES } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';

const EVENT_NAMES = new Set(PRODUCT_EVENT_NAMES);
const PROPERTY_KEYS = new Set(['reason', 'source', 'metric', 'value', 'viewport', 'page']);
const PROPERTY_VALUES = Object.freeze({
  source: new Set(['GITHUB_APP', 'PUBLIC_GIT', 'same', 'latest']),
  metric: new Set(['LCP', 'INP', 'CLS']),
  viewport: new Set(['mobile', 'desktop']),
  page: new Set(['landing', 'auth', 'dashboard', 'projects', 'project', 'deployment', 'admin']),
});

function cleanProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return null;
  }
  const clean = {};
  for (const [key, raw] of Object.entries(properties)) {
    if (!PROPERTY_KEYS.has(key)) {
      continue;
    }
    if (key === 'value') {
      if (Number.isFinite(raw) && raw >= 0 && raw <= 60_000) {
        clean.value = Math.round(raw * 1000) / 1000;
      }
      continue;
    }
    const value = String(raw).slice(0, 80);
    if (PROPERTY_VALUES[key] && !PROPERTY_VALUES[key].has(value)) {
      continue;
    }
    clean[key] = value;
  }
  return Object.keys(clean).length ? clean : null;
}

export async function recordProductEvent({
  name,
  userId = null,
  projectId = null,
  properties = null,
}) {
  if (!EVENT_NAMES.has(name)) {
    return;
  }
  try {
    await ProductEvent.create({ name, userId, projectId, properties: cleanProperties(properties) });
  } catch (error) {
    logger.warn('[analytics] Product event dropped', { name, error: error.message });
  }
}

function percentile(values, p) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

export async function getUxMetrics(days = 30) {
  const safeDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const events = await ProductEvent.find({ createdAt: { $gte: since } })
    .select('name properties')
    .sort({ createdAt: -1 })
    .limit(50_000)
    .lean();
  const counts = Object.fromEntries(PRODUCT_EVENT_NAMES.map((name) => [name, 0]));
  const vitals = {};
  for (const event of events) {
    counts[event.name] = (counts[event.name] ?? 0) + 1;
    if (
      event.name === 'web_vital' &&
      event.properties?.metric &&
      Number.isFinite(event.properties.value)
    ) {
      const key = `${event.properties.metric}:${event.properties.viewport ?? 'desktop'}`;
      (vitals[key] ??= []).push(event.properties.value);
    }
  }
  return {
    days: safeDays,
    counts,
    p75: Object.fromEntries(
      Object.entries(vitals).map(([key, values]) => [key, percentile(values, 0.75)]),
    ),
  };
}
