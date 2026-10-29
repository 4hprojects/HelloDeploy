/**
 * Learning Hub registries. Article Markdown lives in `content/blog/articles`;
 * everything an article references by id (category, author) must be listed here.
 */

export const CATEGORIES = Object.freeze([
  {
    slug: 'deployment-guides',
    name: 'Deployment Guides',
    description:
      'Step-by-step guides for taking an application from a repository to a live address.',
  },
  {
    slug: 'self-hosting',
    name: 'Self-Hosting',
    description: 'Running websites and services on hardware you own and operate.',
  },
  {
    slug: 'hosting-comparisons',
    name: 'Hosting Comparisons',
    description: 'Costs, benefits, and limitations of different hosting models.',
  },
  {
    slug: 'server-management',
    name: 'Server Management',
    description: 'Process managers, reverse proxies, logs, and keeping a server healthy.',
  },
  {
    slug: 'web-security',
    name: 'Web Security',
    description: 'Practical steps for securing web applications before and after launch.',
  },
]);

export const AUTHORS = Object.freeze([
  {
    id: 'henson-sagorsor',
    name: 'Henson Sagorsor',
    role: 'Builder of HelloDeploy',
    bio: 'Henson Sagorsor builds and operates HelloDeploy, a self-hosted deployment platform.',
  },
]);

// Old slug → current slug. A renamed article keeps its id, so its views and
// comments follow it; only the URL changes.
export const SLUG_REDIRECTS = Object.freeze({});

// Path segments under /blog that are routes, so no article may take them.
export const RESERVED_ARTICLE_SLUGS = Object.freeze([
  'api',
  'author',
  'category',
  'feed',
  'page',
  'search',
  'tag',
]);

export const ARTICLES_PER_PAGE = 9;
export const WORDS_PER_MINUTE = 200;
