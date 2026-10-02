export const PUBLIC_DOC_TOPICS = Object.freeze([
  ['getting-started', 'Getting Started'],
  ['supported-applications', 'Supported Applications'],
  ['github-connection', 'GitHub Connection'],
  ['environment-variables', 'Environment Variables'],
  ['deployment-process', 'Deployment Process'],
  ['domains', 'Domains'],
  ['deploy-hooks', 'Deploy Hooks'],
  ['rollback', 'Rollback'],
  ['troubleshooting', 'Troubleshooting'],
  ['service-limits', 'Service Limits'],
  ['faq', 'FAQ'],
]);

export const PUBLIC_PAGES = Object.freeze([
  {
    path: '/',
    title: 'Deploy web apps from GitHub',
    description:
      'Connect a supported GitHub project, review its setup, deploy it, and open a live URL from one dashboard.',
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
