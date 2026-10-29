import { ARTICLES_PER_PAGE } from '../config/learning-hub.js';
import { env } from '../config/env.js';
import { normalizeSearchQuery } from '../services/learning-hub/content-repository.js';

const PAGE_STYLES = ['css/learning-hub.css'];
const PAGE_SCRIPTS = ['js/learning-hub.js'];
const HUB_TITLE = 'Learning Hub';
const HUB_DESCRIPTION =
  'Practical, tested guides for deploying, hosting, securing, and troubleshooting web applications.';

/**
 * Handlers for the public Learning Hub. Each takes the content repository
 * through a getter so tests can supply fixture articles.
 */
export function createBlogController({ getRepository }) {
  function getIndex(req, res, next) {
    const repository = getRepository();
    const query = normalizeSearchQuery(req.query.q);
    const isSearch = query.length > 0;
    const articles = isSearch ? repository.search(query) : repository.listPublished();
    const featured = isSearch ? null : repository.getFeatured();
    const listed = featured ? articles.filter((article) => article.id !== featured.id) : articles;
    const page = paginate(listed, req.query.page);
    if (!page) {
      return next();
    }
    const showFeatured = featured && page.number === 1;

    res.render('pages/blog/index', {
      title: isSearch ? `Search: ${query}` : HUB_TITLE,
      pageMetadata: pageMetadata({
        path: '/blog',
        description: HUB_DESCRIPTION,
        // Search results and later pages are reachable but not worth indexing.
        robots: isSearch || page.number > 1 ? 'noindex,follow' : 'index,follow',
      }),
      pageStyles: PAGE_STYLES,
      pageScripts: PAGE_SCRIPTS,
      query,
      featured: showFeatured ? present(repository, featured) : null,
      articles: page.items.map((article) => present(repository, article)),
      pagination: paginationLinks(page, (number) => blogIndexHref(query, number)),
      categories: repository.listActiveCategories(),
      totalArticles: repository.listPublished().length,
      resultCount: isSearch ? articles.length : null,
    });
  }

  function getCategory(req, res, next) {
    const repository = getRepository();
    const category = repository.findCategory(req.params.slug);
    const articles = category ? repository.listByCategory(category.slug) : [];
    // A category without published articles is a 404, not an empty index page.
    if (articles.length === 0) {
      return next();
    }
    const page = paginate(articles, req.query.page);
    if (!page) {
      return next();
    }
    const path = `/blog/category/${category.slug}`;

    res.render('pages/blog/category', {
      title: `${category.name} — ${HUB_TITLE}`,
      pageMetadata: pageMetadata({
        path,
        description: category.description,
        robots: page.number > 1 ? 'noindex,follow' : 'index,follow',
      }),
      pageStyles: PAGE_STYLES,
      pageScripts: PAGE_SCRIPTS,
      category,
      articles: page.items.map((article) => present(repository, article)),
      pagination: paginationLinks(page, (number) =>
        number === 1 ? path : `${path}?page=${number}`,
      ),
      categories: repository.listActiveCategories(),
    });
  }

  function getArticle(req, res, next) {
    const repository = getRepository();
    const redirect = repository.findRedirect(req.params.slug);
    if (redirect) {
      return res.redirect(301, `/blog/${redirect}`);
    }
    const article = repository.findPublishedBySlug(req.params.slug);
    if (!article) {
      return next();
    }
    const path = `/blog/${article.slug}`;

    res.render('pages/blog/article', {
      title: article.seo.title ?? article.title,
      pageMetadata: pageMetadata({
        path,
        description: article.seo.description ?? article.description,
        robots: 'index,follow',
        imageUrl: article.socialImage ? absoluteUrl(article.socialImage) : undefined,
        ogType: 'article',
        publishedTime: article.publishedAt.toISOString(),
        modifiedTime: (article.updatedAt ?? article.publishedAt).toISOString(),
      }),
      pageStyles: PAGE_STYLES,
      pageScripts: PAGE_SCRIPTS,
      article: present(repository, article),
      canonicalUrl: absoluteUrl(path),
      related: repository.getRelated(article).map((item) => present(repository, item)),
    });
  }

  return { getIndex, getCategory, getArticle };
}

export function absoluteUrl(path) {
  return `https://${env.PLATFORM_DOMAIN}${path}`;
}

function pageMetadata({ path, description, robots, imageUrl, ...rest }) {
  return {
    description,
    robots,
    canonicalUrl: absoluteUrl(path),
    imageUrl: imageUrl ?? absoluteUrl('/assets/social/hellodeploy-og-image.png'),
    ...rest,
  };
}

function present(repository, article) {
  return {
    ...article,
    href: `/blog/${article.slug}`,
    category: repository.findCategory(article.category),
    author: repository.findAuthor(article.authorId),
    publishedLabel: formatDate(article.publishedAt),
    updatedLabel: article.updatedAt ? formatDate(article.updatedAt) : null,
  };
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatDate(date) {
  return DATE_FORMAT.format(date);
}

// Returns null for a page number that is not a positive integer or is past
// the last page, which the caller turns into a 404.
function paginate(items, rawPage) {
  const number = rawPage === undefined ? 1 : Number(rawPage);
  const total = Math.max(1, Math.ceil(items.length / ARTICLES_PER_PAGE));
  if (!Number.isInteger(number) || number < 1 || number > total) {
    return null;
  }
  const start = (number - 1) * ARTICLES_PER_PAGE;
  return { number, total, items: items.slice(start, start + ARTICLES_PER_PAGE) };
}

function paginationLinks(page, hrefFor) {
  if (page.total === 1) {
    return null;
  }
  return {
    current: page.number,
    total: page.total,
    previousHref: page.number > 1 ? hrefFor(page.number - 1) : null,
    nextHref: page.number < page.total ? hrefFor(page.number + 1) : null,
  };
}

function blogIndexHref(query, number) {
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  if (number > 1) {
    params.set('page', String(number));
  }
  const search = params.toString();
  return search ? `/blog?${search}` : '/blog';
}
