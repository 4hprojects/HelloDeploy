/**
 * The public policy pages, in the order the legal index and the related-policy
 * navigation show them. Dates are ISO strings so the views can render a
 * machine-readable <time>.
 */
export const LEGAL_CONTACT_EMAIL = '4hprojects@proton.me';
export const LEGAL_OPERATOR = '4H Projects';

export const LEGAL_POLICIES = Object.freeze([
  {
    slug: 'terms',
    title: 'Terms of Service',
    summary: 'The rules for your account, what you deploy, and what we are responsible for.',
    effective: '2026-06-30',
    updated: '2026-10-31',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'What personal data we collect, why, who receives it, and your rights.',
    effective: '2026-06-30',
    updated: '2026-10-30',
  },
  {
    slug: 'cookies',
    title: 'Cookie Policy',
    summary: 'The one cookie and two browser storage keys HelloDeploy uses.',
    effective: '2026-06-30',
    updated: '2026-10-30',
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    summary: 'What you may and may not deploy, and how violations are handled.',
    effective: '2026-06-29',
    updated: '2026-10-31',
  },
  {
    slug: 'service-limits',
    title: 'Service Limits',
    summary: 'Default quotas, container isolation, and supported runtimes.',
    effective: '2026-06-29',
    updated: '2026-10-31',
  },
  {
    slug: 'data-processing',
    title: 'Data Processing Terms',
    summary: 'Who is responsible for the data your deployed application collects.',
    effective: '2026-06-30',
    updated: '2026-10-30',
  },
  {
    slug: 'copyright',
    title: 'Copyright Policy',
    summary: 'How to report infringing content and send a counter-notice.',
    effective: '2026-06-30',
    updated: '2026-10-30',
  },
  {
    slug: 'security',
    title: 'Security Policy',
    summary: 'How to report a vulnerability and the rules for safe testing.',
    effective: '2026-06-30',
    updated: '2026-10-30',
  },
]);

export function findLegalPolicy(slug) {
  return LEGAL_POLICIES.find((policy) => policy.slug === slug) ?? null;
}
