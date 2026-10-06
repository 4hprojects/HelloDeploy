export const DOC_SECTIONS = Object.freeze([
  {
    title: 'Get started',
    topics: [
      {
        slug: 'getting-started',
        title: 'Getting Started',
        summary: 'From a new account to your first healthy deployment.',
      },
      {
        slug: 'supported-applications',
        title: 'Supported Applications',
        summary: 'Static sites, Node.js, React and Vue builds, and constrained Next.js.',
      },
      {
        slug: 'github-connection',
        title: 'GitHub Connection',
        summary: 'Connect a public repository or install the GitHub App.',
      },
    ],
  },
  {
    title: 'Configure & deploy',
    topics: [
      {
        slug: 'environment-variables',
        title: 'Environment Variables',
        summary: 'Add encrypted values your application needs at runtime.',
      },
      {
        slug: 'deployment-process',
        title: 'Deployment Process',
        summary: 'How a commit becomes a health-checked live release.',
      },
      {
        slug: 'domains',
        title: 'Domains',
        summary: 'Your platform address and verified custom domains.',
      },
      {
        slug: 'deploy-hooks',
        title: 'Deploy Hooks',
        summary: 'A secret URL that starts a deployment.',
      },
    ],
  },
  {
    title: 'Operate',
    topics: [
      {
        slug: 'rollback',
        title: 'Rollback',
        summary: 'Restore a retained healthy release from deployment history.',
      },
      {
        slug: 'troubleshooting',
        title: 'Troubleshooting',
        summary: 'What to check when an app does not become healthy.',
      },
    ],
  },
  {
    title: 'Reference',
    topics: [
      {
        slug: 'service-limits',
        title: 'Service Limits',
        summary: 'Project, deployment, resource, and retention limits for the pilot.',
      },
      { slug: 'faq', title: 'FAQ', summary: 'Pricing, databases, and what the pilot supports.' },
    ],
  },
]);

export const PUBLIC_DOC_TOPICS = Object.freeze(
  DOC_SECTIONS.flatMap((section) => section.topics.map((topic) => [topic.slug, topic.title])),
);

export const PUBLIC_PAGES = Object.freeze([
  {
    path: '/',
    title: 'Deploy web apps from GitHub',
    description:
      'Connect a supported GitHub project, review its setup, deploy it, and open a live URL from one dashboard.',
  },
  {
    path: '/how-it-works',
    title: 'How It Works',
    description:
      'Follow the HelloDeploy journey from connecting a GitHub repository through approval, deployment, health checks, and a live URL.',
  },
  {
    path: '/docs',
    title: 'Documentation',
    description:
      'Learn how to connect, configure, deploy, publish, and troubleshoot an application with HelloDeploy.',
  },
  ...PUBLIC_DOC_TOPICS.map(([slug, title]) => ({
    path: `/docs/${slug}`,
    title,
    description: `${title} guidance for the HelloDeploy deployment platform.`,
  })),
  {
    path: '/supported-apps',
    title: 'Supported Applications',
    description:
      'Check which application types and deployment patterns HelloDeploy currently supports.',
  },
  {
    path: '/pilot',
    title: 'Pilot and Pricing',
    description:
      'Understand HelloDeploy’s free pilot status, limits, availability, recovery scope, and support expectations.',
  },
  {
    path: '/status',
    title: 'Service Status',
    description: 'View the current public readiness of the HelloDeploy pilot.',
  },
  {
    path: '/service-limits',
    title: 'Service Limits',
    description: 'Review the default resource and deployment limits for the HelloDeploy pilot.',
  },
  {
    path: '/security',
    title: 'Security Policy',
    description: 'Review how HelloDeploy protects accounts, secrets, and deployed applications.',
  },
  {
    path: '/terms',
    title: 'Terms of Service',
    description: 'Read the terms for using the HelloDeploy pilot.',
  },
  {
    path: '/legal',
    title: 'Legal Information',
    description: 'Review the legal identity and contact information for HelloDeploy.',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'Learn what HelloDeploy stores and how platform data is used.',
  },
  {
    path: '/cookies',
    title: 'Cookie Policy',
    description: 'Learn which necessary cookies HelloDeploy uses and why.',
  },
  {
    path: '/acceptable-use',
    title: 'Acceptable Use Policy',
    description: 'Review the rules for safe and lawful use of the HelloDeploy pilot.',
  },
  {
    path: '/data-processing',
    title: 'Data Processing Terms',
    description: 'Review how application and account data is processed by HelloDeploy.',
  },
  {
    path: '/copyright',
    title: 'Copyright Policy',
    description: 'Review the process for reporting copyright concerns to HelloDeploy.',
  },
]);

export function publicPageMetadata(path, platformDomain) {
  const page = PUBLIC_PAGES.find((candidate) => candidate.path === path);
  if (!page) {
    return null;
  }
  const origin = `https://${platformDomain}`;
  return {
    ...page,
    canonicalUrl: `${origin}${page.path}`,
    imageUrl: `${origin}/assets/social/hellodeploy-og-image.png`,
    robots: 'index,follow',
  };
}
