/**
 * Redirect public URLs to their canonical spelling.
 *
 * Express routing is case-insensitive and ignores a trailing slash by default,
 * so `/FEATURES`, `/features/` and `/features` all served the same page — and
 * because most public pages derive their canonical tag from the requested
 * path, each variant declared itself canonical rather than consolidating.
 *
 * Scoped deliberately to known public paths. Lowercasing indiscriminately would
 * corrupt case-sensitive values elsewhere, such as the token in a deploy hook
 * URL.
 *
 * @module middleware/canonical-path
 */
import { docsPaths } from '../controllers/docs.controller.js';
import { learnPaths } from '../config/learn-pages.js';
import { livePublicPaths } from '../config/public-pages.js';

const PUBLIC_PATHS = new Set([...livePublicPaths, ...docsPaths, ...learnPaths]);

/** The canonical spelling of a path, or null when it is already canonical. */
function canonicalise(path) {
  let candidate = path.toLowerCase();
  if (candidate.length > 1 && candidate.endsWith('/')) {
    candidate = candidate.slice(0, -1);
  }
  return candidate === path ? null : candidate;
}

export function canonicalPathMiddleware(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const canonical = canonicalise(req.path);
  if (!canonical || !PUBLIC_PATHS.has(canonical)) {
    return next();
  }

  const query = req.originalUrl.slice(req.path.length);
  return res.redirect(301, canonical + query);
}
