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
      {
        slug: 'project-configuration',
        title: 'Project Configuration',
        description:
          'The settings a HelloDeploy project holds — build command, start command, output directory, application port and health check path.',
        file: 'project-configuration.md',
      },
    ],
  },
  {
    heading: 'Deployment Configuration',
    pages: [
      {
        slug: 'build-configuration',
        title: 'Build Configuration',
        description:
          'Set a build command, understand why builds install with npm ci, and configure output directories for static projects.',
        file: 'build-configuration.md',
      },
      {
        slug: 'start-command',
        title: 'Start Command',
        description:
          'How HelloDeploy runs your application after it is built, and which projects need no start command at all.',
        file: 'start-command.md',
      },
      {
        slug: 'application-port',
        title: 'Application Port',
        description:
          'Read the PORT environment variable HelloDeploy injects, bind to every interface, and avoid the most common cause of a failed health check.',
        file: 'application-port.md',
      },
      {
        slug: 'environment-variables',
        title: 'Environment Variables',
        description:
          'Store configuration and secrets outside your source code, why changes need a redeploy, and which names HelloDeploy manages itself.',
        file: 'environment-variables.md',
      },
    ],
  },
  {
    heading: 'Deployments',
    pages: [
      {
        slug: 'deployment-process',
        title: 'Deployment Process',
        description:
          'What happens between publishing and a live site — the six stages of a deployment, the statuses it moves through, and where it can fail.',
        file: 'deployment-process.md',
      },
      {
        slug: 'deployment-logs',
        title: 'Deployment Logs',
        description:
          'Read the record of a deployment, work out which stage failed, and understand what is redacted from log output.',
        file: 'deployment-logs.md',
      },
      {
        slug: 'redeployment',
        title: 'Redeployment',
        description:
          'Publish updates, enable automatic publishing on push, understand why risky file changes pause it, and roll back to a recent release.',
        file: 'redeployment.md',
      },
      {
        slug: 'deploy-hooks',
        title: 'Deploy Hooks',
        description:
          'Trigger a deployment from an external workflow with a private hook URL, and handle its token safely.',
        file: 'deploy-hooks.md',
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
