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
  {
    heading: 'Servers and Infrastructure',
    slug: 'servers-infrastructure',
    pages: [
      article({
        slug: 'what-is-an-application-port',
        title: 'What Is an Application Port?',
        description:
          'What a port is, why production chooses one for you, the difference between binding localhost and every interface, and what a mismatch looks like.',
        file: 'what-is-an-application-port.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-is-a-reverse-proxy',
        title: 'What Is a Reverse Proxy?',
        description:
          'The server that receives requests on behalf of your application, what it handles for you, and why a new release only gets traffic once it is healthy.',
        file: 'what-is-a-reverse-proxy.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'what-is-nginx',
        title: 'What Is Nginx?',
        description:
          'The software behind most 502 pages — what it does, how to read its errors, and whether you need to learn it.',
        file: 'what-is-nginx.md',
        published: '2026-09-28',
      }),
    ],
  },
  {
    heading: 'Troubleshooting',
    slug: 'troubleshooting',
    pages: [
      article({
        slug: 'dependency-installation-failed',
        path: '/learn/troubleshooting/dependency-installation-failed',
        title: 'Dependency Installation Failed',
        description:
          'A deployment that stops while installing packages — usually a missing or mismatched npm lockfile.',
        file: 'ts-dependency-installation-failed.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'build-command-failed',
        path: '/learn/troubleshooting/build-command-failed',
        title: 'Build Command Failed',
        description:
          'Your build ran and returned an error. Uncommitted files, path capitalisation and missing build variables are the usual causes.',
        file: 'ts-build-command-failed.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'app-starts-but-site-does-not-load',
        path: '/learn/troubleshooting/app-starts-but-site-does-not-load',
        title: 'The App Starts but the Site Does Not Load',
        description:
          'A build that succeeds and a health check that fails — almost always the port, or binding to localhost inside a container.',
        file: 'ts-app-starts-but-site-does-not-load.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'application-port-incorrect',
        path: '/learn/troubleshooting/application-port-incorrect',
        title: 'Application Port Is Incorrect',
        description:
          'Your application is listening where nobody is asking. Read the PORT variable HelloDeploy injects.',
        file: 'ts-application-port-incorrect.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'missing-environment-variable',
        path: '/learn/troubleshooting/missing-environment-variable',
        title: 'Missing Environment Variable',
        description:
          'A value your application needs is absent, or was added after the running release started and needs a redeploy.',
        file: 'ts-missing-environment-variable.md',
        published: '2026-09-28',
      }),
      article({
        slug: 'application-keeps-restarting',
        path: '/learn/troubleshooting/application-keeps-restarting',
        title: 'The Application Keeps Restarting',
        description:
          'A process that starts, exits and starts again — startup errors, crashes, memory limits, or a command that finishes.',
        file: 'ts-application-keeps-restarting.md',
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
