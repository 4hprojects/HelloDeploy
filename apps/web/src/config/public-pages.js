/**
 * The public marketing and legal surface.
 *
 * One entry per page, shared by the public nav, the public footer and `/sitemap.xml` so
 * those three cannot drift apart.
 *
 * `live: false` marks a page that has no route yet. Flip it in the same change that
 * registers the route — nothing should link to or list a page that would 404.
 */

const PRODUCT = 'Product';
const COMPANY = 'Company';
const LEGAL = 'Legal';

/** Ordered as the content spec's navigation lists them. */
const publicPages = [
  { path: '/', label: 'Home', group: null, live: true },

  { path: '/how-it-works', label: 'How It Works', group: PRODUCT, live: true },
  { path: '/features', label: 'Features', group: PRODUCT, live: true },
  { path: '/supported-runtimes', label: 'Supported Runtimes', group: PRODUCT, live: true },
  { path: '/pricing', label: 'Pricing', group: PRODUCT, live: true },

  { path: '/about', label: 'About', group: COMPANY, live: true },
  { path: '/contact', label: 'Contact', group: COMPANY, live: true },

  { path: '/legal', label: 'Legal Overview', group: LEGAL, live: true },
  { path: '/privacy', label: 'Privacy Policy', group: LEGAL, live: true },
  { path: '/terms', label: 'Terms of Service', group: LEGAL, live: true },
  { path: '/cookies', label: 'Cookie Policy', group: LEGAL, live: true },
  { path: '/acceptable-use', label: 'Acceptable Use Policy', group: LEGAL, live: true },
  { path: '/service-limits', label: 'Service Limits', group: LEGAL, live: true },
  { path: '/data-processing', label: 'Data Processing Terms', group: LEGAL, live: true },
  { path: '/copyright', label: 'Copyright Policy', group: LEGAL, live: true },
  { path: '/security', label: 'Security Policy', group: LEGAL, live: true },
];

function toColumns(groups) {
  return groups
    .map((heading) => ({
      heading,
      links: publicPages.filter((page) => page.group === heading && page.live),
    }))
    .filter((column) => column.links.length > 0);
}

/** Flat link list for the top navigation. */
export const publicNavLinks = publicPages.filter(
  (page) => page.live && (page.group === PRODUCT || page.group === COMPANY),
);

/** Grouped columns for the footer. */
export const publicFooterColumns = toColumns([PRODUCT, COMPANY, LEGAL]);

/** Every public path that exists, for the sitemap. */
export const livePublicPaths = publicPages.filter((page) => page.live).map((page) => page.path);
