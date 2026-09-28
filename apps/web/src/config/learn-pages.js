/**
 * The Learn surface: conceptual articles and troubleshooting guides.
 *
 * As with the documentation registry, metadata lives here rather than in front
 * matter, so the markdown holds nothing but prose. Editorial articles carry an
 * author and dates because the content spec requires them for structured data.
 *
 * Troubleshooting guides sit under `/learn/troubleshooting/`, which is why a
 * page carries its own `path` rather than having one derived from the slug.
 */

const AUTHOR = 'Henson Sagorsor';

/**
 * @typedef {{
 *   slug: string, path: string, title: string, description: string,
 *   file: string, published: string, updated: string, author: string,
 * }} LearnPage
 */

function article(entry) {
  return {
    author: AUTHOR,
    updated: entry.updated ?? entry.published,
    path: entry.path ?? `/learn/${entry.slug}`,
    ...entry,
  };
}

/** @type {{ heading: string, slug: string, pages: LearnPage[] }[]} */
export const learnCategories = [
  {
    heading: 'Deployment',
    slug: 'deployment',
    pages: [
      article({
        slug: 'what-is-web-deployment',
        title: 'What Is Web Deployment?',
        description:
          'What it means to deploy a website, what has to happen before people can visit it, and why it is more than uploading files.',
        file: 'what-is-web-deployment.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-happens-when-you-deploy-a-website',
        title: 'What Happens When You Deploy a Website?',
        description:
          'A step-by-step account of what a deployment platform does between your code and a working address.',
        file: 'what-happens-when-you-deploy-a-website.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-is-a-build-command',
        title: 'What Is a Build Command?',
        description:
          'Why many projects need a build step before production, what a build actually produces, and how to tell whether yours needs one.',
        file: 'what-is-a-build-command.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-is-a-start-command',
        title: 'What Is a Start Command?',
        description:
          'How a deployed application is started, why the command must keep running, and which projects need no start command at all.',
        file: 'what-is-a-start-command.md',
        published: '2026-09-28',
      }),
    ],
  },
];

/** Every article, in listing order. */
export const learnPages = learnCategories.flatMap((category) => category.pages);

/** @returns {LearnPage | undefined} */
export function findLearnPage(slug) {
  return learnPages.find((page) => page.slug === slug);
}

/** The category an article belongs to, for breadcrumbs. */
export function getLearnCategory(slug) {
  return (
    learnCategories.find((category) => category.pages.some((page) => page.slug === slug)) ?? null
  );
}

/** Learn paths for the sitemap. */
export const learnPaths = ['/learn', ...learnPages.map((page) => page.path)];
