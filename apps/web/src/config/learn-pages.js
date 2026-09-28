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
      article({
        slug: 'what-are-deployment-logs',
        title: 'What Are Deployment Logs?',
        description:
          'How to read the record a deployment leaves, tell build failures from startup failures, and find the error that actually matters.',
        file: 'what-are-deployment-logs.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-is-a-deploy-hook',
        title: 'What Is a Deploy Hook?',
        description:
          'A private URL that triggers a deployment, what people use one for, and why it has to be treated like a password.',
        file: 'what-is-a-deploy-hook.md',
        published: '2026-09-28',
      }),
    ],
  },
  {
    heading: 'Hosting',
    slug: 'hosting',
    pages: [
      article({
        slug: 'what-is-web-hosting',
        title: 'What Is Web Hosting?',
        description:
          'What you are actually renting when you buy hosting, why a domain is a separate thing, and how static and application hosting differ.',
        file: 'what-is-web-hosting.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-is-a-vps',
        title: 'What Is a VPS?',
        description:
          'What a virtual private server gives you, what it makes you responsible for, and when it is more machine than your project needs.',
        file: 'what-is-a-vps.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'shared-hosting-vs-vps-vs-cloud-hosting',
        title: 'Shared Hosting vs VPS vs Cloud Hosting',
        description:
          'How the three compare on control, isolation, resources, scaling and maintenance — and which suits a small project.',
        file: 'shared-hosting-vs-vps-vs-cloud-hosting.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'how-multiple-websites-run-on-one-server',
        title: 'How Multiple Websites Run on One Server',
        description:
          'How one machine serves many sites at one address, what a reverse proxy does, and why your application port is invisible to visitors.',
        file: 'how-multiple-websites-run-on-one-server.md',
        published: '2026-09-28',
      }),
    ],
  },
  {
    heading: 'Domains and DNS',
    slug: 'domains-dns',
    pages: [
      article({
        slug: 'what-is-dns',
        title: 'What Is DNS?',
        description:
          'How a domain name becomes an address, what the record types do, and why changes are never instant.',
        file: 'what-is-dns.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'why-hellodeploy-uses-a-cname',
        title: 'Why HelloDeploy Uses a CNAME (and Not an A Record)',
        description:
          'The difference between an A record and a CNAME, and why a tunnel-based platform has no IP address for you to point at.',
        file: 'why-hellodeploy-uses-a-cname.md',
        published: '2026-09-28',
      }),
    ],
  },
  {
    heading: 'Security',
    slug: 'security',
    pages: [
      article({
        slug: 'what-is-https',
        title: 'What Is HTTPS?',
        description:
          'What encrypting traffic protects, what a certificate adds, and why a padlock does not mean a site is trustworthy.',
        file: 'what-is-https.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-is-an-ssl-certificate',
        title: 'What Is an SSL Certificate?',
        description:
          'What a TLS certificate contains, what a browser checks, what it proves and does not prove, and why they expire.',
        file: 'what-is-an-ssl-certificate.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-are-environment-variables',
        title: 'What Are Environment Variables?',
        description:
          'Keeping configuration and secrets outside your code, the limits of what they protect, and the frontend trap that makes keys public.',
        file: 'what-are-environment-variables.md',
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
