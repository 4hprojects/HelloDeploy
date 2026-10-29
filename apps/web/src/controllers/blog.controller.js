import { ARTICLES_PER_PAGE } from '../config/learning-hub.js';
import { env } from '../config/env.js';
import { normalizeSearchQuery } from '../services/learning-hub/content-repository.js';
import * as articleStats from '../services/learning-hub/article-stats.service.js';
import { articleAdSlot, learningHubAnalytics } from '../services/learning-hub/page-integrations.js';

const PAGE_STYLES = ['css/learning-hub.css'];
const PAGE_SCRIPTS = ['js/learning-hub.js'];
const HUB_TITLE = 'Learning Hub';
const COMMENT_VIEW_PARAMS = ['commentsPage', 'thread', 'replyTo'];
const HUB_DESCRIPTION =
  'Practical, tested guides for deploying, hosting, securing, and troubleshooting web applications.';

/**
 * Handlers for the public Learning Hub. Each takes the content repository
 * through a getter so tests can supply fixture articles.
 */
export function createBlogController({
  getRepository,
  viewsEnabled = false,
  stats = articleStats,
  discussion = null,
  analytics = learningHubAnalytics(),
}) {
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
      analytics,
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
      analytics,
      category,
      articles: page.items.map((article) => present(repository, article)),
      pagination: paginationLinks(page, (number) =>
        number === 1 ? path : `${path}?page=${number}`,
      ),
      categories: repository.listActiveCategories(),
    });
  }

  async function getArticle(req, res, next) {
    const repository = getRepository();
    const redirect = repository.findRedirect(req.params.slug);
    if (redirect) {
      return res.redirect(301, `/blog/${redirect}`);
    }
    const article = repository.findPublishedBySlug(req.params.slug);
    if (!article) {
      return next();
    }
    await renderArticle(req, res, article);
  }

  /** Render an article, optionally after a failed comment submission. */
  async function renderArticle(req, res, article, { status = 200, form } = {}) {
    const repository = getRepository();
    const path = `/blog/${article.slug}`;
    const canonicalUrl = absoluteUrl(path);
    const [viewCount, comments] = await Promise.all([
      viewsEnabled ? stats.getArticleViewCount(article.id) : null,
      discussion
        ? discussion.load(article, {
            page: req.query.commentsPage,
            thread: req.query.thread,
            replyTo: form?.replyTo ?? req.query.replyTo,
            form,
          })
        : { availability: { visible: false, accepting: false } },
    ]);

    res.status(status).render('pages/blog/article', {
      title: article.seo.title ?? article.title,
      pageMetadata: pageMetadata({
        path,
        description: article.seo.description ?? article.description,
        // Comment pagination and reply links are views of the same article.
        robots: COMMENT_VIEW_PARAMS.some((param) => param in req.query)
          ? 'noindex,follow'
          : 'index,follow',
        imageUrl: article.socialImage ? absoluteUrl(article.socialImage) : undefined,
        ogType: 'article',
        publishedTime: article.publishedAt.toISOString(),
        modifiedTime: (article.updatedAt ?? article.publishedAt).toISOString(),
        structuredData: articleStructuredData(repository, article, canonicalUrl),
      }),
      pageStyles: PAGE_STYLES,
      pageScripts: PAGE_SCRIPTS,
      analytics,
      adSlot: articleAdSlot({ article, discussionVisible: comments.availability.visible }),
      article: present(repository, article),
      canonicalUrl,
      shareLinks: shareLinks(canonicalUrl, article.title),
      viewsEnabled,
      viewCount,
      comments,
      related: repository.getRelated(article).map((item) => present(repository, item)),
    });
  }

  async function postView(req, res) {
    const article = getRepository().findPublishedById(req.params.id);
    if (!viewsEnabled || !article) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown article.' } });
    }
    const result = await stats.recordArticleView({
      articleId: article.id,
      sessionId: req.sessionID,
      sourceIp: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(202).json({ counted: result.counted });
  }

  async function postShare(req, res) {
    const article = getRepository().findPublishedById(req.params.id);
    if (!article) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown article.' } });
    }
    const result = await stats.recordShareClick({
      articleId: article.id,
      platform: req.body?.platform,
    });
    if (result.reason === 'unknown_platform') {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_PLATFORM', message: 'Unknown share platform.' } });
    }
    res.status(202).json({ recorded: result.recorded });
  }

  return { getIndex, getCategory, getArticle, renderArticle, postView, postShare };
}

/** Share targets built from the canonical URL; each is a plain link that works without JavaScript. */
export function shareLinks(canonicalUrl, title) {
  const url = encodeURIComponent(canonicalUrl);
  return [
    {
      platform: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    },
    {
      platform: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    },
    {
      platform: 'x',
      label: 'X',
      href: `https://x.com/intent/post?url=${url}&text=${encodeURIComponent(title)}`,
    },
  ];
}

/**
 * BlogPosting and BreadcrumbList data. Every value repeats what the page
 * shows (title, author, dates, image); nothing is added that a reader
 * cannot see.
 */
export function articleStructuredData(repository, article, canonicalUrl) {
  const category = repository.findCategory(article.category);
  const author = repository.findAuthor(article.authorId);
  const image = absoluteUrl(
    article.socialImage ?? article.heroImage?.src ?? '/assets/social/hellodeploy-og-image.png',
  );
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.description,
      datePublished: article.publishedAt.toISOString(),
      dateModified: (article.updatedAt ?? article.publishedAt).toISOString(),
      author: { '@type': 'Person', name: author.name },
      publisher: {
        '@type': 'Organization',
        name: 'HelloDeploy',
        logo: { '@type': 'ImageObject', url: absoluteUrl('/assets/icons/icon-512.png') },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      image,
      articleSection: category.name,
      keywords: article.tags.join(', '),
      wordCount: article.wordCount,
      inLanguage: 'en',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: HUB_TITLE, item: absoluteUrl('/blog') },
        {
          '@type': 'ListItem',
          position: 2,
          name: category.name,
          item: absoluteUrl(`/blog/category/${category.slug}`),
        },
        { '@type': 'ListItem', position: 3, name: article.title, item: canonicalUrl },
      ],
    },
  ];
}

/** Indexable Learning Hub URLs for the sitemap, each with a meaningful lastmod. */
export function learningHubSitemapEntries(repository) {
  const articles = repository.listPublished();
  if (articles.length === 0) {
    return [];
  }
  const modified = (article) => article.updatedAt ?? article.publishedAt;
  const newest = (list) => new Date(Math.max(...list.map((article) => modified(article))));
  return [
    { loc: absoluteUrl('/blog'), lastmod: newest(articles) },
    ...repository.listActiveCategories().map((category) => ({
      loc: absoluteUrl(`/blog/category/${category.slug}`),
      lastmod: newest(repository.listByCategory(category.slug)),
    })),
    ...articles.map((article) => ({
      loc: absoluteUrl(`/blog/${article.slug}`),
      lastmod: modified(article),
    })),
  ];
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
