/**
 * The documentation surface.
 *
 * Page metadata lives here rather than in front matter, so the markdown files
 * hold nothing but prose and no second dependency is needed to parse them. The
 * order of this list is the order of the sidebar, the breadcrumbs and the
 * previous/next links, so moving a page moves all three together.
 *
 * `file` is resolved against `apps/web/content/docs/`.
 */

/** @typedef {{ slug: string, title: string, description: string, file: string }} DocsPage */

/** @type {{ heading: string, pages: DocsPage[] }[]} */
export const docsSections = [
  {
    heading: 'Getting Started',
    pages: [
      {
        slug: 'getting-started',
        title: 'Getting Started',
        description:
          'Deploy your first project with HelloDeploy, from connecting a repository to a running website.',
        file: 'getting-started.md',
      },
    ],
  },
];

/** Every page, in sidebar order. */
export const docsPages = docsSections.flatMap((section) => section.pages);

/** @returns {DocsPage | undefined} */
export function findDocsPage(slug) {
  return docsPages.find((page) => page.slug === slug);
}

/**
 * The pages either side of one, for previous/next links.
 *
 * @returns {{ previous: DocsPage | null, next: DocsPage | null }}
 */
export function getDocsNeighbours(slug) {
  const index = docsPages.findIndex((page) => page.slug === slug);
  if (index === -1) {
    return { previous: null, next: null };
  }
  return {
    previous: docsPages[index - 1] ?? null,
    next: docsPages[index + 1] ?? null,
  };
}

/** The section a page belongs to, for breadcrumbs. */
export function getDocsSection(slug) {
  return docsSections.find((section) => section.pages.some((page) => page.slug === slug)) ?? null;
}
