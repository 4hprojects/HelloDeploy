import express from 'express';
import expressEjsLayouts from 'express-ejs-layouts';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';

import { correlationIdMiddleware } from './middleware/correlation-id.js';
import { createSessionMiddleware } from './middleware/session.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { applicationLocals, localsMiddleware } from './middleware/locals.js';
import { maintenanceModeMiddleware } from './middleware/maintenance-mode.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { requireAuth } from './middleware/require-auth.js';
import authRoutes from './routes/pages/auth.routes.js';
import projectRoutes from './routes/pages/project.routes.js';
import adminRoutes from './routes/pages/admin.routes.js';
import githubRoutes from './routes/pages/github.routes.js';
import webhookRoutes from './routes/api/webhook.routes.js';
import deployHookRoutes from './routes/api/deploy-hook.routes.js';
import { createBlogRouter } from './routes/pages/blog.routes.js';
import helmet from 'helmet';
import { getDashboard, getDashboardStatusJson } from './controllers/dashboard.controller.js';
import { getPlanDefaults } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';
import { env } from './config/env.js';
import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR, LEGAL_POLICIES } from './config/legal-policies.js';
import { checkWebReadiness } from './services/readiness.service.js';
import { releaseSha } from './utils/release-sha.js';
import { getContentRepository } from './services/learning-hub/content-repository.js';
import { analyticsCspSources } from './services/learning-hub/page-integrations.js';
import {
  getDocsIndex,
  getDocsTopic,
  getHowItWorks,
  getSupportedApps,
  getPilot,
  getAbout,
  getFeatures,
  getContact,
  getPremium,
  getPublicStatus,
  getRobots,
  getSitemap,
} from './controllers/public.controller.js';
import { postWebVital } from './controllers/telemetry.controller.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRIVATE_PATH_PREFIXES = ['/dashboard', '/projects', '/admin', '/auth', '/account', '/github'];

function cspNonceMiddleware(_req, res, next) {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
}

export function createApp({
  readinessCheck = checkWebReadiness,
  learningHub = {
    enabled: env.LEARNING_HUB_ENABLED,
    viewsEnabled: env.LEARNING_HUB_VIEWS_ENABLED,
    getRepository: getContentRepository,
  },
} = {}) {
  const app = express();

  // Trust proxy headers (for rate limiting by IP behind Nginx / Cloudflare).
  // Two hops sit in front of the app — cloudflared, then nginx, both on
  // loopback. Trusting only one leaves req.ip pinned to cloudflared's local
  // address, which silently merges every visitor into a single rate-limit
  // bucket and records 127.0.0.1 as the source of every audited action.
  app.set('trust proxy', 2);

  app.use(cspNonceMiddleware);

  // Liveness only proves that the HTTP process can respond. Readiness is a
  // separate dependency check and intentionally returns only component names.
  //
  // `commit` is here so a deploy can be confirmed from outside the host. Nothing
  // could previously say which code was running without filesystem access to
  // /opt/hellodeploy, which meant every release was taken on trust. The value is
  // an opaque SHA against a private repository, so it tells an unauthenticated
  // caller nothing they could look up; it is null when it cannot be read.
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'web',
      commit: releaseSha,
      timestamp: new Date().toISOString(),
    });
  });
  app.get('/ready', async (_req, res) => {
    try {
      const result = await readinessCheck();
      res.status(result.ready ? 200 : 503).json({
        status: result.ready ? 'ready' : 'not_ready',
        service: 'web',
        checks: result.checks,
      });
    } catch {
      res.status(503).json({ status: 'not_ready', service: 'web' });
    }
  });

  // Security headers. Inline scripts are blocked except the per-request nonce
  // used by the early theme bootstrap. Inline styles remain temporarily allowed
  // while legacy style attributes are migrated into CSS classes.
  // Empty unless GA4 is configured and the owner confirmed consent handling.
  const analyticsSources = analyticsCspSources();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          scriptSrc: [
            "'self'",
            (_req, res) => `'nonce-${res.locals.cspNonce}'`,
            'https://challenges.cloudflare.com',
            ...analyticsSources.script,
          ],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'"],
          styleSrcAttr: ["'none'"],
          imgSrc: ["'self'", 'data:', ...analyticsSources.img],
          fontSrc: ["'self'"],
          connectSrc: ["'self'", 'https://challenges.cloudflare.com', ...analyticsSources.connect],
          frameSrc: ['https://challenges.cloudflare.com'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', join(__dirname, 'views'));
  app.use(expressEjsLayouts);
  app.set('layout', 'layouts/main');
  Object.assign(app.locals, applicationLocals(), {
    learningHubEnabled: learningHub.enabled,
    learningHubRepository: learningHub.enabled ? learningHub.getRepository : null,
    googleSiteVerification: env.GOOGLE_SITE_VERIFICATION,
    legalContactEmail: LEGAL_CONTACT_EMAIL,
    legalOperator: LEGAL_OPERATOR,
    legalPolicies: LEGAL_POLICIES,
  });

  // Static assets (served before rate limiting to avoid counting static hits).
  // Modest cache TTL — filenames are not content-hashed, so avoid long/immutable.
  app.use(
    '/assets-dist',
    express.static(join(__dirname, '..', 'public', 'assets-dist'), {
      maxAge: '1y',
      immutable: true,
    }),
  );
  app.use(express.static(join(__dirname, '..', 'public'), { maxAge: '1h' }));

  // ── Webhook route — must be registered BEFORE express.json() parses the body.
  //    express.raw() on this route preserves the raw Buffer for HMAC verification.
  //    Also registered before CSRF so GitHub can POST without a CSRF token.
  app.use('/api/webhooks', webhookRoutes);

  // ── Core middleware stack ──────────────────────────────────────────────────
  app.use(correlationIdMiddleware);
  // robots.txt only stops crawling; the header also keeps a private page out
  // of search results when someone links to it.
  app.use((req, res, next) => {
    if (
      PRIVATE_PATH_PREFIXES.some(
        (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
      )
    ) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Deploy hook route — token-authenticated, called by external CI systems
  //    without a browser session, so it must skip session/CSRF middleware.
  app.use('/api/deploy-hooks', deployHookRoutes);

  const sessionMiddleware = createSessionMiddleware();
  app.locals.drainSessionWrites = sessionMiddleware.drainPendingWrites;
  app.use(sessionMiddleware);
  app.use(csrfMiddleware);
  app.use(localsMiddleware);
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    next();
  });
  app.use(maintenanceModeMiddleware);
  if (env.isProduction()) {
    app.use(generalLimiter);
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/auth', authRoutes);
  app.use('/projects', projectRoutes);
  app.use('/admin', adminRoutes);
  app.use('/github', githubRoutes);

  app.get('/', (req, res) => {
    if (req.session?.user) {
      return res.redirect('/dashboard');
    }
    res.render('pages/index', { title: 'HelloDeploy', planDefaults: getPlanDefaults() });
  });

  app.get('/how-it-works', getHowItWorks);
  app.get('/docs', getDocsIndex);
  app.get('/docs/:topic', getDocsTopic);
  app.get('/supported-apps', getSupportedApps);
  app.get('/pilot', getPilot);
  app.get('/pricing', (_req, res) => res.redirect(301, '/pilot'));
  app.get('/about', getAbout);
  app.get('/features', getFeatures);
  app.get('/contact', getContact);
  app.get('/faq', (_req, res) => res.redirect(301, '/docs/faq'));
  app.get('/help', (_req, res) => res.redirect(301, '/docs'));
  app.get('/premium', getPremium);
  app.get('/status', getPublicStatus);
  app.get('/robots.txt', getRobots);
  app.get('/sitemap.xml', getSitemap);
  if (learningHub.enabled) {
    app.use('/blog', createBlogRouter(learningHub));
  }

  app.get('/dashboard', requireAuth, getDashboard);
  app.get('/dashboard/status', requireAuth, getDashboardStatusJson);
  app.post('/telemetry/web-vitals', postWebVital);

  // ── Public policy pages ────────────────────────────────────────────────────
  app.get('/legal', (_req, res) =>
    res.render('pages/legal', { title: 'Legal', pageStyles: ['css/legal.css'] }),
  );
  for (const policy of LEGAL_POLICIES) {
    app.get(`/${policy.slug}`, (_req, res) =>
      res.render(`pages/${policy.slug}`, {
        title: policy.title,
        policy,
        pageStyles: ['css/legal.css'],
      }),
    );
  }

  // ── Error pages ────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).render('pages/404', { title: 'Page Not Found', layout: 'layouts/main' });
  });

  app.use((err, req, res, _next) => {
    logger.error('[web] Unhandled error', {
      message: err.message,
      stack: err.stack,
      correlationId: req.correlationId,
      method: req.method,
      url: req.originalUrl,
    });
    res.status(500).render('pages/error', {
      title: 'Something Went Wrong',
      layout: 'layouts/main',
      message: 'An unexpected error occurred. Please try again.',
      modal: true,
      eyebrow: 'Unexpected error',
    });
  });

  return app;
}
