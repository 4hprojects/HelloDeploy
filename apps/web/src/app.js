import { layoutForRequest } from './utils/error-layout.js';
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
import { contactLimiter, generalLimiter } from './middleware/rate-limit.js';
import { requireAuth } from './middleware/require-auth.js';
import authRoutes from './routes/pages/auth.routes.js';
import accountRoutes from './routes/pages/account.routes.js';
import projectRoutes from './routes/pages/project.routes.js';
import adminRoutes from './routes/pages/admin.routes.js';
import githubRoutes from './routes/pages/github.routes.js';
import webhookRoutes from './routes/api/webhook.routes.js';
import deployHookRoutes from './routes/api/deploy-hook.routes.js';
import helmet from 'helmet';
import { getDashboard } from './controllers/dashboard.controller.js';
import { getContact, postContact } from './controllers/contact.controller.js';
import { docsPaths, getDocsArticle, getDocsIndex } from './controllers/docs.controller.js';
import {
  getLearnArticle,
  getLearnIndex,
  getTroubleshootingArticle,
} from './controllers/learn.controller.js';
import { learnPaths } from './config/learn-pages.js';
import { logger } from '@hellodeploy/observability';
import { env } from './config/env.js';
import { livePublicPaths } from './config/public-pages.js';
import { checkWebReadiness } from './services/readiness.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Marketing and legal pages render without the authenticated app chrome. */
const PUBLIC_LAYOUT = 'layouts/public';

function cspNonceMiddleware(_req, res, next) {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
}

export function createApp({ readinessCheck = checkWebReadiness } = {}) {
  const app = express();

  // Trust proxy headers (for rate limiting by IP behind Nginx / Cloudflare)
  app.set('trust proxy', 1);

  app.use(cspNonceMiddleware);

  // Liveness only proves that the HTTP process can respond. Readiness is a
  // separate dependency check and intentionally returns only component names.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'web', timestamp: new Date().toISOString() });
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
          ],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'"],
          styleSrcAttr: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
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

  // Static assets (served before rate limiting to avoid counting static hits).
  // Modest cache TTL — filenames are not content-hashed, so avoid long/immutable.
  app.use(express.static(join(__dirname, '..', 'public'), { maxAge: '1h' }));

  // ── Webhook route — must be registered BEFORE express.json() parses the body.
  //    express.raw() on this route preserves the raw Buffer for HMAC verification.
  //    Also registered before CSRF so GitHub can POST without a CSRF token.
  app.use('/api/webhooks', webhookRoutes);

  // ── Core middleware stack ──────────────────────────────────────────────────
  app.use(correlationIdMiddleware);
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
  app.use(maintenanceModeMiddleware);
  if (env.isProduction()) {
    app.use(generalLimiter);
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/auth', authRoutes);
  app.use('/account', accountRoutes);
  app.use('/projects', projectRoutes);
  app.use('/admin', adminRoutes);
  app.use('/github', githubRoutes);

  // Signed-in visitors see the marketing homepage too — the nav offers them the dashboard
  // rather than redirecting them away from public content.
  app.get('/', (_req, res) => {
    res.render('pages/index', {
      // head.ejs appends ' — HelloDeploy', so the brand is not repeated here.
      title: 'Simple Web Application Deployment',
      description:
        'Deploy and manage supported web applications with guided setup, custom domains, HTTPS, environment variables, logs, and redeployment through HelloDeploy.',
      layout: PUBLIC_LAYOUT,
    });
  });

  app.get('/dashboard', requireAuth, getDashboard);

  app.get('/features', (_req, res) => {
    res.render('pages/features', {
      title: 'Features',
      description:
        'Explore HelloDeploy features including deployment management, environment variables, deployment logs, domains, HTTPS, redeployment, and deploy hooks.',
      deploymentDomain: env.DEPLOYMENT_DOMAIN,
      layout: PUBLIC_LAYOUT,
    });
  });

  app.get('/how-it-works', (_req, res) => {
    res.render('pages/how-it-works', {
      title: 'How It Works',
      description:
        'Learn how HelloDeploy moves a supported web application from project configuration to build, deployment, HTTPS, domains, and production updates.',
      layout: PUBLIC_LAYOUT,
    });
  });

  app.get('/supported-runtimes', (_req, res) => {
    res.render('pages/supported-runtimes', {
      title: 'Supported Runtimes',
      description:
        'See which runtimes and frameworks are currently supported, being tested, or planned by HelloDeploy, and what each one needs before it will deploy.',
      layout: PUBLIC_LAYOUT,
    });
  });

  app.get('/pricing', (_req, res) => {
    res.render('pages/pricing', {
      title: 'Pricing',
      description:
        'Proposed HelloDeploy plans for learning, personal projects, production apps, freelancers, and growing teams — and what every account gets free today.',
      layout: PUBLIC_LAYOUT,
    });
  });

  app.get('/about', (_req, res) => {
    res.render('pages/about', {
      title: 'About',
      description:
        'Learn why HelloDeploy was created and how it aims to simplify web application deployment for developers, students, educators, and small teams.',
      layout: PUBLIC_LAYOUT,
    });
  });

  app.get('/learn', getLearnIndex);
  app.get('/learn/troubleshooting/:slug', getTroubleshootingArticle);
  app.get('/learn/:slug', getLearnArticle);

  app.get('/docs', getDocsIndex);
  app.get('/docs/:slug', getDocsArticle);

  app.get('/contact', getContact);
  app.post('/contact', contactLimiter, postContact);

  // ── Public policy pages ────────────────────────────────────────────────────
  app.get('/legal', (_req, res) =>
    res.render('pages/legal', {
      title: 'Legal',
      description:
        'Index of the HelloDeploy legal policies covering terms of service, privacy, cookies, acceptable use, service limits, data processing, copyright, and security.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/terms', (_req, res) =>
    res.render('pages/terms', {
      title: 'Terms of Service',
      description:
        'The terms that govern use of the HelloDeploy deployment platform, including account responsibilities, acceptable use, and service availability.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/privacy', (_req, res) =>
    res.render('pages/privacy', {
      title: 'Privacy Policy',
      description:
        'How HelloDeploy collects, uses, stores, and retains account, deployment, and log data, and the choices available to you.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/cookies', (_req, res) =>
    res.render('pages/cookies', {
      title: 'Cookie Policy',
      description:
        'The cookies HelloDeploy sets, what each one is used for, and how to control them in your browser.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/acceptable-use', (_req, res) =>
    res.render('pages/acceptable-use', {
      title: 'Acceptable Use Policy',
      description:
        'What you may and may not deploy or run on HelloDeploy, and how abuse reports are handled.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/service-limits', (_req, res) =>
    res.render('pages/service-limits', {
      title: 'Service Limits',
      description:
        'The resource, project, and deployment limits that apply to HelloDeploy accounts and how they are enforced.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/data-processing', (_req, res) =>
    res.render('pages/data-processing', {
      title: 'Data Processing Terms',
      description:
        'How HelloDeploy processes personal data on behalf of customers, including sub-processors and security measures.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/copyright', (_req, res) =>
    res.render('pages/copyright', {
      title: 'Copyright Policy',
      description:
        'How to report copyright infringement on content deployed through HelloDeploy, and how those reports are handled.',
      layout: PUBLIC_LAYOUT,
    }),
  );
  app.get('/security', (_req, res) =>
    res.render('pages/security', {
      title: 'Security Policy',
      description:
        'How to report a security vulnerability in HelloDeploy, and the security measures that protect deployments and secrets.',
      layout: PUBLIC_LAYOUT,
    }),
  );

  // ── Crawler files ──────────────────────────────────────────────────────────
  // Served as routes rather than static files so the origin matches the environment
  // instead of hardcoding production into a checked-in file.
  app.get('/robots.txt', (_req, res) => {
    const disallowed = [
      '/auth/',
      '/dashboard',
      '/projects',
      '/account',
      '/admin',
      '/github',
      '/api/',
    ];
    const body = [
      '# Public content is crawlable; the authenticated application is not.',
      'User-agent: *',
      'Allow: /',
      '',
      ...disallowed.map((path) => `Disallow: ${path}`),
      '',
      `Sitemap: ${res.locals.siteUrl}/sitemap.xml`,
      '',
    ].join('\n');

    res.type('text/plain').send(body);
  });

  app.get('/sitemap.xml', (_req, res) => {
    const urls = [...new Set([...livePublicPaths, ...docsPaths, ...learnPaths])]
      .map((path) => `  <url><loc>${res.locals.siteUrl}${path}</loc></url>`)
      .join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

    res.type('application/xml').send(body);
  });

  // ── Error pages ────────────────────────────────────────────────────────────
  // A signed-in user who mistypes a URL stays in the app chrome; a visitor gets the
  // marketing chrome rather than a sidebar full of links they cannot use.
  app.use((req, res) => {
    res.status(404).render('pages/404', {
      title: 'Page Not Found',
      layout: layoutForRequest(req),
    });
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
      layout: layoutForRequest(req),
      message: 'An unexpected error occurred. Please try again.',
    });
  });

  return app;
}
