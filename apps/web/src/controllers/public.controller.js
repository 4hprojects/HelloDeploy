import { getPlanDefaults } from '@hellodeploy/database';

import { asyncHandler } from '../utils/async-handler.js';
import { checkWebReadiness } from '../services/readiness.service.js';
import { DOC_SECTIONS, PUBLIC_DOC_TOPICS, PUBLIC_PAGES } from '../config/public-pages.js';
import { env } from '../config/env.js';
import { donationOptions } from '../config/donations.js';
import { LEGAL_POLICIES } from '../config/legal-policies.js';
import { learningHubSitemapEntries } from './blog.controller.js';

const TOPIC_CONTENT = Object.freeze({
  'service-limits': [
    'The public pilot uses bounded project, deployment, memory, CPU, domain, and retention limits.',
    'Review the complete current limits before relying on the service for a project.',
  ],
});

const CORE_TOPIC_CONTENT = Object.freeze({
  domains: {
    lead: 'Every project gets a platform address, and you can add a verified custom domain.',
    sections: [
      {
        title: 'Your platform address',
        paragraphs: [
          'A project receives its permanent address when you create it. The address starts serving traffic after the first healthy deployment, over HTTPS.',
        ],
      },
      {
        title: 'Add a custom domain',
        ordered: true,
        items: [
          'Open the project and select Domains, then enter the hostname you own.',
          'Create the DNS TXT record shown on the Domains page at your DNS provider. HelloDeploy stores only a hash of the token.',
          'Select Verify. DNS changes can take time to appear, so try again later if the record is not found yet.',
          'Wait for an administrator to approve the verified domain during the pilot.',
          'Follow the routing step shown on the Domains page to point the hostname at HelloDeploy.',
        ],
        note: {
          title: 'Limits',
          body: 'The pilot allows one custom domain by default. The Domains page always shows the next required action.',
        },
      },
    ],
  },
  'deploy-hooks': {
    lead: 'A deploy hook is a secret URL that starts a deployment, for example from CI after tests pass.',
    sections: [
      {
        title: 'Create a hook',
        ordered: true,
        items: [
          'Open the project, then Deploy hook. Only the project owner can manage it.',
          'Generate the hook and copy the URL straight away. It is shown once; HelloDeploy stores only its hash.',
          'Store the URL as a secret in your CI system, never in the repository.',
        ],
      },
      {
        title: 'Call the hook',
        paragraphs: [
          'Send an HTTP POST request to the hook URL. Each call starts a deployment of the project branch and counts toward the monthly deployment limit. Calls are rate-limited.',
        ],
      },
      {
        title: 'If the URL leaks',
        paragraphs: [
          'Revoke the hook on the same page, then generate a new one. The old URL stops working at once.',
        ],
      },
    ],
  },
  rollback: {
    lead: 'Rollback restores a recent healthy release without a new build.',
    sections: [
      {
        title: 'Which releases you can restore',
        paragraphs: [
          'HelloDeploy keeps your most recent healthy releases, 3 by default. Older release images are deleted automatically, so they cannot be restored.',
        ],
      },
      {
        title: 'Roll back',
        ordered: true,
        items: [
          'Open Deployments and find a retained healthy release.',
          'Select Rollback and confirm.',
          'HelloDeploy starts the old release and health-checks it before switching traffic. If the check fails, the current release stays live.',
        ],
        note: {
          title: 'What does not roll back',
          body: 'Rollback restores your application image. It does not undo changes to environment variables or to data in an external database.',
        },
      },
    ],
  },
  troubleshooting: {
    lead: 'Start with the plain-language summary on the failed deployment, then work through the checks below.',
    sections: [
      {
        title: 'The build failed',
        items: [
          'Commit a lockfile (package-lock.json) that matches package.json, and make sure the install runs on Node.js 22.',
          'Check the build command in App setup. Run it locally on a clean checkout to reproduce the error.',
          'If the logs mention a missing module or build output, confirm the output folder in App setup matches what the build produces.',
        ],
      },
      {
        title: 'The app built but never became healthy',
        items: [
          'Listen on the port in the PORT environment variable. HelloDeploy always sets it, and a different port fails the health check.',
          'Make sure the start command keeps a server running. A command that exits counts as a crash.',
          'Add every required environment variable. Missing values are a common cause of a crash at start-up.',
          'If the app uses a database, allow connections from the internet and use the provider\u2019s connection string, not localhost.',
        ],
      },
      {
        title: 'The app keeps restarting',
        paragraphs: [
          'Restarts during the health window count as a crash loop and fail the release. Check the last lines of the runtime log for the error, and check memory use against the per-app limit.',
        ],
      },
      {
        title: 'Still stuck',
        paragraphs: [
          'Email the address on the Contact page with the project name and the deployment number. Do not send passwords, tokens, or secret values, and remove them from any log you share.',
        ],
      },
    ],
  },
  logs: {
    lead: 'Each deployment keeps its own build and runtime logs.',
    sections: [
      {
        title: 'Where to find them',
        paragraphs: [
          'Open Deployments and select Logs on any deployment. While a deployment runs, new lines appear live.',
        ],
      },
      {
        title: 'What is hidden',
        paragraphs: [
          'Common secret formats, such as GitHub and AWS tokens, bearer tokens, private keys, and key=value pairs that look like secrets, are redacted before logs are stored. Redaction is a safety net, not a guarantee: never print secret values from your app.',
        ],
      },
      {
        title: 'How long logs are kept',
        paragraphs: [
          'Logs are deleted automatically after 30 days. Copy anything you need to keep before then.',
        ],
      },
    ],
  },
  'stop-and-delete': {
    lead: 'What happens when you delete a project or disconnect GitHub, and what you are responsible for keeping.',
    sections: [
      {
        title: 'Delete a project',
        paragraphs: [
          'Only the project owner can delete a project, and you must type the project slug in Settings to confirm. Deletion cannot be undone.',
        ],
        items: [
          'Stopped and removed: the running app, its containers, release images, and its network and platform route.',
          'Deleted: environment variables, domains, deployment history and logs, members, and the project itself.',
          'Kept for a limited time: activity records expire after 90 days, and server backups age out on the schedule in the Privacy Policy.',
        ],
      },
      {
        title: 'Disconnect GitHub',
        paragraphs: [
          'Disconnecting a repository from a project, or uninstalling the GitHub App on GitHub, stops new deployments from that repository. The app that is already running keeps running until you delete the project.',
        ],
      },
      {
        title: 'Your backups',
        paragraphs: [
          'HelloDeploy does not back up your application data or any database your app uses. Keep your source in GitHub and back up external databases with their provider.',
        ],
      },
      {
        title: 'Close your account',
        paragraphs: [
          'Request closure from the Close account section of your Account page, or email the contact address. An administrator completes the request: your projects are deleted as described above, and account data is removed within 30 days.',
        ],
      },
    ],
  },
  'getting-started': {
    lead: 'Follow this path from a new account to the first healthy release of a supported application.',
    sections: [
      {
        title: 'Before you begin',
        items: [
          'Keep the application in a GitHub repository you can authorize or make public.',
          'Confirm that its runtime and deployment pattern appear in Supported Applications.',
          'Commit a dependency lockfile and know which production branch should be deployed.',
          'Have any required external service or database connection values ready, but never commit them to Git.',
        ],
      },
      {
        title: 'Complete your first deployment',
        ordered: true,
        items: [
          'Create an account and verify the email address before signing in.',
          'Select Create Project, choose a name, and confirm the permanent project address.',
          'Connect a public GitHub URL or authorize the GitHub App, then select the production branch.',
          'Open App setup and select Check my app. Resolve every item marked Fix required.',
          'Add the environment variables detected from the repository and any other runtime values the application needs.',
          'Return to the project overview, describe what the application does, and select Submit for review.',
          'After approval, open Deployments and select Deploy Latest.',
          'Wait for the release to become Healthy, then open the assigned project address.',
        ],
        note: {
          title: 'Initial approval is required',
          body: 'Approval applies to the project configuration. Later source commits can deploy without another review unless a sensitive configuration or high-risk file changes.',
        },
      },
      {
        title: 'What success looks like',
        paragraphs: [
          'A successful deployment is marked Healthy and has a live platform address. The deployment detail page keeps its exact commit, progress, duration, and redacted logs.',
          'If the first attempt fails, open its plain-language summary, correct the reported setup issue, and retry. A failed update never replaces an existing healthy release.',
        ],
      },
    ],
  },
  'supported-applications': {
    lead: 'Check the application type and repository shape before spending time on project setup.',
    sections: [
      {
        title: 'Supported application types',
        items: [
          'Static HTML, CSS, and JavaScript websites.',
          'Node.js applications with a reproducible start command.',
          'Express applications that listen on the configured application port.',
          'React and Vue applications that produce a static build output.',
          'Next.js applications that fit the pilot resource and runtime constraints.',
        ],
      },
      {
        title: 'Prepare the repository',
        items: [
          'Commit the appropriate npm lockfile so dependency installation is reproducible.',
          'Define the required build or start script in package.json.',
          'Keep generated dependencies, local .env files, and secrets out of the repository.',
          'Make the health-check path return a successful response after the application starts.',
        ],
      },
      {
        title: 'Not currently supported',
        items: [
          'Python, PHP, Java, GPU, game-server, video-encoding, proxy, VPN, or mining workloads.',
          'User-supplied Docker Compose files, arbitrary registry images, or privileged containers.',
          'Applications that require multiple deployment nodes, autoscaling, or high-availability guarantees.',
        ],
      },
      {
        title: 'Databases and external services',
        paragraphs: [
          'HelloDeploy can inject encrypted connection values for an external database or API, but it does not create, administer, back up, or guarantee those services.',
        ],
        note: {
          title: 'Check the full matrix',
          body: 'The dedicated Supported Applications page is the concise source for current pilot compatibility and exclusions.',
        },
      },
    ],
  },
  'github-connection': {
    lead: 'Choose the connection method that matches the repository visibility and deployment behavior you need.',
    sections: [
      {
        title: 'Choose a source type',
        items: [
          'Public Git uses a public https://github.com/owner/repository URL and supports manual deployments.',
          'The GitHub App supports private repositories and optional automatic deployments from the production branch.',
        ],
      },
      {
        title: 'Connect a public repository',
        ordered: true,
        items: [
          'Open Repository from the project setup path and paste the public GitHub URL.',
          'Select Check repository so HelloDeploy can confirm access and load its branches.',
          'Choose the production branch and select Connect Public Repository.',
        ],
      },
      {
        title: 'Connect through the GitHub App',
        ordered: true,
        items: [
          'Select Install GitHub App and grant access only to the repositories HelloDeploy should use.',
          'Return to the project, choose an authorized repository, and select its production branch.',
          'Select Connect GitHub Repository. Automatic mode can be enabled after the project is approved.',
        ],
      },
      {
        title: 'Branches, access, and automatic deployment',
        paragraphs: [
          'The production branch identifies the source HelloDeploy treats as deployable. Manual mode records available updates until an Owner or Maintainer starts a deployment.',
          'In Automatic mode, a signed push to that branch can deploy. High-risk configuration changes pause automatic deployment for review instead of going live immediately.',
        ],
        note: {
          title: 'Repository access can change',
          body: 'If access is revoked or the repository is replaced, new deployments stop. An existing healthy release remains available until another authorized operation changes it.',
        },
      },
    ],
  },
  'environment-variables': {
    lead: 'Store runtime configuration separately from source code and redeploy when a release needs new values.',
    sections: [
      {
        title: 'When to add a variable',
        items: [
          'Add names detected from an environment sample file before the first deployment.',
          'Add connection strings, API keys, and other values the application reads while starting or running.',
          'Do not add values that belong in ordinary source configuration or expose secrets through public build prefixes.',
        ],
      },
      {
        title: 'Add or import values',
        ordered: true,
        items: [
          'Open Environment Variables from the project setup or settings pages.',
          'Import a bounded .env file or add one uppercase name and value at a time.',
          'Confirm every detected required name is marked Set before requesting review or deploying.',
        ],
      },
      {
        title: 'How values are handled',
        items: [
          'Values are encrypted immediately at rest and hidden in normal lists.',
          'Only the Owner can reveal saved values, on purpose with Show all values, and every reveal is recorded in the audit log.',
          'Logs and user-facing errors redact known secrets, but applications must still avoid printing credentials.',
          'Replacing or deleting a stored value does not alter the container that is already live.',
        ],
      },
      {
        title: 'Apply a change',
        paragraphs: [
          'Start a new deployment after adding, replacing, or deleting environment variables. The candidate receives the current saved values; the live release keeps its previous environment until traffic switches.',
        ],
        note: {
          title: 'External databases stay external',
          body: 'A DATABASE_URL or similar value only connects the application. HelloDeploy does not provision, migrate, back up, or restore the referenced database.',
        },
      },
    ],
  },
  'deployment-process': {
    lead: 'A deployment turns one exact Git commit into a checked candidate release before any live traffic moves.',
    sections: [
      {
        title: 'Before a deployment can start',
        items: [
          'The project must be approved and its repository access must still be valid.',
          'The latest app setup check must be current and free of blocking findings.',
          'Required environment variables, quota, monthly allowance, and queue capacity must be available.',
        ],
      },
      {
        title: 'Release stages',
        ordered: true,
        items: [
          'HelloDeploy records the deployment and resolves the exact selected commit.',
          'The worker validates the repository and prepares a controlled build context.',
          'A container image is built under bounded time and resource limits.',
          'A candidate container starts with the saved runtime configuration.',
          'The configured health check must succeed before the candidate is eligible for traffic.',
          'Routing switches atomically, public verification runs, and the deployment becomes Healthy.',
          'The previous release enters the retained rollback window and older releases are cleaned up.',
        ],
      },
      {
        title: 'If the candidate fails',
        paragraphs: [
          'HelloDeploy records the failing stage, a safe summary, and redacted logs. The candidate and temporary routing are cleaned up.',
          'A failed candidate does not replace the current healthy release. Correct the configuration or source issue, then retry the same commit or deploy the latest one.',
        ],
      },
      {
        title: 'After a healthy deployment',
        items: [
          'Open the platform address and confirm the application behaves as expected.',
          'Use deployment history to identify the commit and configuration used for each attempt.',
          'Roll back to a retained healthy release, listed as Previous release, from Advanced deployment on the Deployments page.',
          'Use Rebuild Without Cache under Advanced deployment only when stale build layers are a plausible cause of a problem.',
        ],
      },
    ],
  },
});

const QUICK_START_SLUGS = Object.freeze([
  'getting-started',
  'supported-applications',
  'github-connection',
  'environment-variables',
  'deployment-process',
]);

function findDocTopic(slug) {
  return DOC_SECTIONS.flatMap((section) => section.topics).find((topic) => topic.slug === slug);
}

const FAQ = Object.freeze([
  ['Is the pilot free?', 'Yes, within the published limits.'],
  ['Does HelloDeploy host databases?', 'No. Use an external database provider.'],
  ['Can I upload Docker Compose or privileged images?', 'Not in the current pilot.'],
  [
    'Does a failed deployment take down my live release?',
    'No; traffic stays on the previous healthy release.',
  ],
  ['Are there paid plans?', 'No. HelloDeploy is free during the pilot and nothing is for sale.'],
  [
    'Who owns the code I deploy?',
    'You do. HelloDeploy only builds and runs it to provide the service.',
  ],
  [
    'How do I close my account?',
    'Email the contact address. Projects are deleted and account data is removed within 30 days.',
  ],
  [
    'How do I get help?',
    'Email the address on the Contact page. Support is best-effort, and you should never send passwords, tokens, or secret values.',
  ],
  [
    'Where do I report a security problem?',
    'Follow the Security Policy. Please report privately and do not test against other users\u2019 apps.',
  ],
]);

export function getDocsIndex(_req, res) {
  res.render('pages/docs/index', {
    title: 'Documentation',
    sections: DOC_SECTIONS,
    quickStart: QUICK_START_SLUGS.map(findDocTopic),
  });
}

export function getDocsTopic(req, res) {
  const index = PUBLIC_DOC_TOPICS.findIndex(([slug]) => slug === req.params.topic);
  if (index === -1) {
    return res.status(404).render('pages/404', { title: 'Page Not Found' });
  }
  const [slug, title] = PUBLIC_DOC_TOPICS[index];
  const toLink = (entry) => (entry ? { slug: entry[0], title: entry[1] } : null);
  res.render('pages/docs/topic', {
    title,
    sections: DOC_SECTIONS,
    topic: {
      slug,
      title,
      sectionTitle: DOC_SECTIONS.find((section) => section.topics.some((t) => t.slug === slug))
        .title,
      content: CORE_TOPIC_CONTENT[slug] ?? null,
      points: TOPIC_CONTENT[slug] ?? [],
      faq: slug === 'faq' ? FAQ : null,
    },
    previous: toLink(PUBLIC_DOC_TOPICS[index - 1]),
    next: toLink(PUBLIC_DOC_TOPICS[index + 1]),
  });
}

export function getSupportedApps(_req, res) {
  res.render('pages/supported-apps', { title: 'Supported Applications' });
}

export function getHowItWorks(_req, res) {
  res.render('pages/how-it-works', { title: 'How It Works' });
}

// Premium is granted by an administrator, never sold; the page is linked from
// the monthly deployment limit message.
export function getPremium(_req, res) {
  res.render('pages/premium', { title: 'HelloDeploy Premium' });
}

export function getPilot(_req, res) {
  res.render('pages/pilot', {
    title: 'Pilot and Pricing',
    planDefaults: getPlanDefaults(),
    donations: donationOptions(),
  });
}

export function getAbout(_req, res) {
  res.render('pages/about', { title: 'About' });
}

export function getContact(_req, res) {
  res.render('pages/contact', { title: 'Contact and Support' });
}

export function getFeatures(_req, res) {
  res.render('pages/features', { title: 'Features', planDefaults: getPlanDefaults() });
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

export function getSitemap(req, res) {
  const policyUpdated = new Map(
    LEGAL_POLICIES.map((policy) => [`/${policy.slug}`, policy.updated]),
  );
  const pages = PUBLIC_PAGES.map((page) => {
    const updated = policyUpdated.get(page.path);
    const lastmod = updated ? `<lastmod>${updated}</lastmod>` : '';
    return `  <url><loc>https://${env.PLATFORM_DOMAIN}${page.path}</loc>${lastmod}</url>`;
  });
  const getRepository = req.app?.locals?.learningHubRepository;
  const articles = getRepository
    ? learningHubSitemapEntries(getRepository()).map(
        (entry) =>
          `  <url><loc>${entry.loc}</loc><lastmod>${entry.lastmod.toISOString().slice(0, 10)}</lastmod></url>`,
      )
    : [];
  res
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages, ...articles].join('\n')}\n</urlset>\n`,
    );
}
