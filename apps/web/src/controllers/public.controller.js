import { asyncHandler } from '../utils/async-handler.js';
import { checkWebReadiness } from '../services/readiness.service.js';
import { PUBLIC_DOC_TOPICS, PUBLIC_PAGES } from '../config/public-pages.js';
import { env } from '../config/env.js';

const TOPIC_CONTENT = Object.freeze({
  'getting-started': [
    'Create and verify your account.',
    'Create a project name and permanent address.',
    'Connect a public repository or GitHub App installation.',
    'Check the detected setup, add required variables, request approval, and deploy.',
  ],
  'supported-applications': [
    'Static HTML, CSS, and JavaScript sites',
    'Node.js and Express applications',
    'React and Vue static builds',
    'Constrained Next.js applications',
  ],
  'github-connection': [
    'Public GitHub repositories can be connected by HTTPS URL for manual deployments.',
    'The GitHub App supports private repositories and automatic deployments.',
    'Choose the production branch whose commits HelloDeploy should publish.',
  ],
  'environment-variables': [
    'Add only values your application needs.',
    'Values are encrypted at rest and are not shown in normal lists after saving.',
    'Deploy again after a change so the next container receives the new values.',
  ],
  'deployment-process': [
    'HelloDeploy checks the selected commit and builds a controlled container image.',
    'A candidate container must start and pass its health check before traffic moves.',
    'A failed candidate does not replace the existing live release.',
  ],
  domains: [
    'Every project receives a platform address after its first healthy deployment.',
    'A custom domain requires a DNS ownership record and routing setup.',
    'The Domains page always shows the next required action and the exact DNS fields.',
  ],
  'deploy-hooks': [
    'A deploy hook is a secret URL that starts a deployment.',
    'The raw URL is shown once; HelloDeploy stores only its hash.',
    'Revoke and regenerate a hook immediately if it may have been exposed.',
  ],
  rollback: [
    'Choose a retained healthy release from deployment history.',
    'HelloDeploy starts and checks it before switching traffic.',
    'The rollback is recorded as a new operation and identifies the restored release.',
  ],
  troubleshooting: [
    'Start with the plain-language failure summary and recommended action.',
    'Check the start command, port, required variables, and health path when an app does not become healthy.',
    'Use redacted technical logs when the summary is not enough.',
  ],
  'service-limits': [
    'The public pilot uses bounded project, deployment, memory, CPU, storage, domain, and retention limits.',
    'Review the complete current limits before relying on the service for a project.',
  ],
  faq: [
    'Is the pilot free? Yes, within the published limits.',
    'Does HelloDeploy host databases? No. Use an external database provider.',
    'Can I upload Docker Compose or privileged images? Not in the current pilot.',
    'Does a failed deployment take down my live release? No; traffic stays on the previous healthy release.',
  ],
});

export function getDocsIndex(_req, res) {
  res.render('pages/docs/index', { title: 'Documentation', topics: PUBLIC_DOC_TOPICS });
}

export function getDocsTopic(req, res) {
  const topic = PUBLIC_DOC_TOPICS.find(([slug]) => slug === req.params.topic);
  if (!topic) {
    return res.status(404).render('pages/404', { title: 'Page Not Found' });
  }
  res.render('pages/docs/topic', {
    title: topic[1],
    topic: { slug: topic[0], title: topic[1], points: TOPIC_CONTENT[topic[0]] ?? [] },
  });
}

export function getSupportedApps(_req, res) {
  res.render('pages/supported-apps', { title: 'Supported Applications' });
}

export function getPilot(_req, res) {
  res.render('pages/pilot', { title: 'Pilot and Pricing' });
}

export const getPublicStatus = asyncHandler(async (_req, res) => {
  let readiness = { ready: false, checks: {} };
  try {
    readiness = await checkWebReadiness();
  } catch {
    // The status page remains useful when a dependency check itself fails.
  }
  res.setHeader('Cache-Control', 'no-store');
  res.render('pages/status', {
    title: 'Service Status',
    operational: readiness.ready,
    checkedAt: new Date(),
  });
});

export function getRobots(_req, res) {
  res
    .type('text/plain')
    .send(
      `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /projects\nDisallow: /admin\nDisallow: /auth/verify-email\nSitemap: https://${env.PLATFORM_DOMAIN}/sitemap.xml\n`,
    );
}

export function getSitemap(_req, res) {
  const urls = PUBLIC_PAGES.map(
    (page) => `  <url><loc>https://${env.PLATFORM_DOMAIN}${page.path}</loc></url>`,
  ).join('\n');
  res
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
}
