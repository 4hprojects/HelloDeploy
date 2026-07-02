import express from 'express';
import expressEjsLayouts from 'express-ejs-layouts';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';

import { correlationIdMiddleware } from './middleware/correlation-id.js';
import { createSessionMiddleware } from './middleware/session.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { localsMiddleware } from './middleware/locals.js';
import { maintenanceModeMiddleware } from './middleware/maintenance-mode.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { requireAuth } from './middleware/require-auth.js';
import authRoutes from './routes/pages/auth.routes.js';
import projectRoutes from './routes/pages/project.routes.js';
import adminRoutes from './routes/pages/admin.routes.js';
import githubRoutes from './routes/pages/github.routes.js';
import webhookRoutes from './routes/api/webhook.routes.js';
import helmet from 'helmet';
import { getDashboard } from './controllers/dashboard.controller.js';
import { logger } from '@hellodeploy/observability';

const __dirname = dirname(fileURLToPath(import.meta.url));

function cspNonceMiddleware(_req, res, next) {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
}

export function createApp() {
  const app = express();

  // Trust proxy headers (for rate limiting by IP behind Nginx / Cloudflare)
  app.set('trust proxy', 1);

  app.use(cspNonceMiddleware);

  // Security headers. Inline scripts are blocked except the per-request nonce
  // used by the early theme bootstrap. Inline styles remain temporarily allowed
  // while legacy style attributes are migrated into CSS classes.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${res.locals.cspNonce}'`],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'"],
          styleSrcAttr: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
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

  // Static assets (served before rate limiting to avoid counting static hits)
  app.use(express.static(join(__dirname, '..', 'public')));

  // ── Webhook route — must be registered BEFORE express.json() parses the body.
  //    express.raw() on this route preserves the raw Buffer for HMAC verification.
  //    Also registered before CSRF so GitHub can POST without a CSRF token.
  app.use('/api/webhooks', webhookRoutes);

  // ── Core middleware stack ──────────────────────────────────────────────────
  app.use(correlationIdMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(createSessionMiddleware());
  app.use(csrfMiddleware);
  app.use(localsMiddleware);
  app.use(maintenanceModeMiddleware);
  app.use(generalLimiter);

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'web', timestamp: new Date().toISOString() });
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/auth', authRoutes);
  app.use('/projects', projectRoutes);
  app.use('/admin', adminRoutes);
  app.use('/github', githubRoutes);

  app.get('/', (req, res) => {
    if (req.session?.user) {
      return res.redirect('/dashboard');
    }
    res.render('pages/index', { title: 'HelloDeploy' });
  });

  app.get('/dashboard', requireAuth, getDashboard);

  // ── Public policy pages ────────────────────────────────────────────────────
  app.get('/legal', (_req, res) => res.render('pages/legal', { title: 'Legal' }));
  app.get('/terms', (_req, res) => res.render('pages/terms', { title: 'Terms of Service' }));
  app.get('/privacy', (_req, res) => res.render('pages/privacy', { title: 'Privacy Policy' }));
  app.get('/cookies', (_req, res) => res.render('pages/cookies', { title: 'Cookie Policy' }));
  app.get('/acceptable-use', (_req, res) =>
    res.render('pages/acceptable-use', { title: 'Acceptable Use Policy' }),
  );
  app.get('/service-limits', (_req, res) =>
    res.render('pages/service-limits', { title: 'Service Limits' }),
  );
  app.get('/data-processing', (_req, res) =>
    res.render('pages/data-processing', { title: 'Data Processing Terms' }),
  );
  app.get('/copyright', (_req, res) =>
    res.render('pages/copyright', { title: 'Copyright Policy' }),
  );
  app.get('/security', (_req, res) => res.render('pages/security', { title: 'Security Policy' }));

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
    });
  });

  return app;
}
