const SETTINGS_ANCHORS = new Set([
  'general',
  'source-build',
  'deployment',
  'custom-domains',
  'notifications',
  'health-maintenance',
  'danger-zone',
]);

export function projectReturnTarget(req, fallback) {
  const returnTo = typeof req.body?.returnTo === 'string' ? req.body.returnTo : '';
  const prefix = `/projects/${req.project.slug}/settings#`;
  if (!returnTo.startsWith(prefix)) {
    return fallback;
  }
  const anchor = returnTo.slice(prefix.length);
  return SETTINGS_ANCHORS.has(anchor) ? returnTo : fallback;
}
