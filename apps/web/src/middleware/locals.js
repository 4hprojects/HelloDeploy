/**
 * Attach per-request template locals:
 * - csrfToken: CSRF synchronizer token for forms
 * - user: Current session user (or null)
 * - flash: One-time messages, cleared after read
 * - currentPath: For active nav link detection
 * - uiMode: Interface complexity preference (SIMPLE or ADVANCED)
 * - siteUrl: Absolute origin, for canonical and Open Graph URLs
 * - publicNavLinks / publicFooterColumns: The public marketing surface
 */
import { UiMode } from '@hellodeploy/contracts';

import { env } from '../config/env.js';
import { publicFooterColumns, publicNavLinks } from '../config/public-pages.js';

// PLATFORM_DOMAIN carries a port in development and a bare hostname in production.
const SITE_URL = `${env.isProduction() ? 'https' : 'http'}://${env.PLATFORM_DOMAIN}`;

export function localsMiddleware(req, res, next) {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  res.locals.user = req.session?.user ?? null;
  res.locals.currentPath = req.path;
  // Signed-out visitors and sessions predating the field fall back to SIMPLE.
  res.locals.uiMode = req.session?.user?.uiMode ?? UiMode.SIMPLE;
  res.locals.turnstileSiteKey = env.TURNSTILE_SITE_KEY ?? '';
  res.locals.siteUrl = SITE_URL;
  res.locals.publicNavLinks = publicNavLinks;
  res.locals.publicFooterColumns = publicFooterColumns;

  // Consume flash messages — read once and clear
  res.locals.flash = req.session?.flash ?? {};
  if (req.session?.flash) {
    delete req.session.flash;
  }

  // Helper to set a flash message for the next request
  req.flash = (type, message) => {
    if (req.session) {
      req.session.flash = req.session.flash ?? {};
      req.session.flash[type] = message;
    }
  };

  next();
}
