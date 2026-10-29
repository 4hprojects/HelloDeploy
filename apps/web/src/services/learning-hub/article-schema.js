import { parse as parseYaml } from 'yaml';

import { RESERVED_ARTICLE_SLUGS, WORDS_PER_MINUTE } from '../../config/learning-hub.js';
import { renderArticleMarkdown } from './markdown.js';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTICLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const LOCAL_IMAGE = /^\/assets\/blog\/[a-z0-9/_-]+\.(?:png|jpe?g|webp|svg)$/;

const ALLOWED_FIELDS = new Set([
  'id',
  'slug',
  'title',
  'description',
  'category',
  'tags',
  'authorId',
  'status',
  'featured',
  'publishedAt',
  'updatedAt',
  'heroImage',
  'socialImage',
  'difficulty',
  'commentsEnabled',
  'adEligible',
  'testedEnvironment',
  'references',
  'seo',
]);
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const STATUSES = ['draft', 'published'];

/**
 * Parse one article file. Returns `{ article, errors }`; an article with any
 * error must not be published.
 */
export function parseArticleFile(raw, { file, categories, authors, now = new Date() }) {
  const errors = [];
  const match = FRONT_MATTER.exec(raw);
  if (!match) {
    return { article: null, errors: [`${file}: missing YAML front matter block.`] };
  }

  let data;
  try {
    data = parseYaml(match[1], { schema: 'core', uniqueKeys: true });
  } catch (error) {
    return { article: null, errors: [`${file}: malformed YAML front matter (${error.message}).`] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { article: null, errors: [`${file}: front matter must be a mapping.`] };
  }

  const fail = (message) => errors.push(`${file}: ${message}`);

  for (const key of Object.keys(data)) {
    if (!ALLOWED_FIELDS.has(key)) {
      fail(`unknown front matter field "${key}".`);
    }
  }

  requireString(data, 'id', fail, { pattern: ARTICLE_ID, max: 64 });
  requireString(data, 'slug', fail, { pattern: SLUG, max: 80 });
  requireString(data, 'title', fail, { min: 10, max: 110 });
  requireString(data, 'description', fail, { min: 50, max: 170 });
  if (RESERVED_ARTICLE_SLUGS.includes(data.slug)) {
    fail(`slug "${data.slug}" is reserved.`);
  }
  if (!categories.some((category) => category.slug === data.category)) {
    fail(`category "${data.category}" is not in the category registry.`);
  }
  if (!authors.some((author) => author.id === data.authorId)) {
    fail(`authorId "${data.authorId}" is not in the author registry.`);
  }
  if (!STATUSES.includes(data.status)) {
    fail(`status must be one of ${STATUSES.join(', ')}.`);
  }
  if (!DIFFICULTIES.includes(data.difficulty)) {
    fail(`difficulty must be one of ${DIFFICULTIES.join(', ')}.`);
  }
  if (
    !Array.isArray(data.tags) ||
    data.tags.length === 0 ||
    data.tags.length > 8 ||
    !data.tags.every((tag) => typeof tag === 'string' && SLUG.test(tag))
  ) {
    fail('tags must be 1–8 lowercase slug strings.');
  }
  for (const flag of ['featured', 'commentsEnabled', 'adEligible']) {
    if (data[flag] !== undefined && typeof data[flag] !== 'boolean') {
      fail(`${flag} must be true or false.`);
    }
  }

  const publishedAt = parseDate(data.publishedAt);
  if (!publishedAt) {
    fail('publishedAt must be an ISO 8601 date.');
  } else if (data.status === 'published' && publishedAt > now) {
    fail('publishedAt is in the future; scheduled publishing is not supported.');
  }
  const updatedAt = data.updatedAt === undefined ? null : parseDate(data.updatedAt);
  if (data.updatedAt !== undefined && !updatedAt) {
    fail('updatedAt must be an ISO 8601 date.');
  } else if (updatedAt && publishedAt && updatedAt < publishedAt) {
    fail('updatedAt is earlier than publishedAt.');
  } else if (updatedAt && data.status === 'published' && updatedAt > now) {
    fail('updatedAt is in the future.');
  }

  const heroImage = validateImage(data.heroImage, 'heroImage', fail);
  if (data.socialImage !== undefined && !LOCAL_IMAGE.test(String(data.socialImage))) {
    fail('socialImage must be a local /assets/blog/ image path.');
  }
  const references = validateReferences(data.references, fail);
  const testedEnvironment = validateTestedEnvironment(data.testedEnvironment, fail);
  const seo = validateSeo(data.seo, fail);

  const body = match[2];
  const rendered = renderArticleMarkdown(body);
  rendered.problems.forEach(fail);

  if (errors.length > 0) {
    return { article: null, errors };
  }

  return {
    article: Object.freeze({
      id: data.id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      category: data.category,
      tags: Object.freeze([...data.tags]),
      authorId: data.authorId,
      status: data.status,
      featured: data.featured === true,
      publishedAt,
      updatedAt,
      heroImage,
      socialImage: data.socialImage ?? null,
      difficulty: data.difficulty,
      commentsEnabled: data.commentsEnabled === true,
      adEligible: data.adEligible === true,
      testedEnvironment,
      references,
      seo,
      html: rendered.html,
      headings: Object.freeze(rendered.headings),
      links: Object.freeze(rendered.links),
      searchText: `${data.title} ${data.description} ${data.tags.join(' ')} ${body}`.toLowerCase(),
      readingMinutes: Math.max(1, Math.ceil(rendered.wordCount / WORDS_PER_MINUTE)),
      wordCount: rendered.wordCount,
      file,
    }),
    errors,
  };
}

function requireString(data, key, fail, { pattern, min = 1, max }) {
  const value = data[key];
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    fail(`${key} must be a string of ${min}–${max} characters.`);
    return;
  }
  if (pattern && !pattern.test(value)) {
    fail(`${key} "${value}" has an invalid format.`);
  }
}

function parseDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    return null;
  }
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // Reject rollovers such as 2026-02-31, which Date silently turns into March.
  if (value.length === 10 && date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

function validateImage(image, key, fail) {
  if (image === undefined) {
    return null;
  }
  if (
    !image ||
    typeof image !== 'object' ||
    !LOCAL_IMAGE.test(String(image.src)) ||
    typeof image.alt !== 'string' ||
    image.alt.trim().length < 5 ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height)
  ) {
    fail(
      `${key} needs a local /assets/blog/ src, descriptive alt text, and integer width and height.`,
    );
    return null;
  }
  return Object.freeze({
    src: image.src,
    alt: image.alt,
    width: image.width,
    height: image.height,
  });
}

function validateReferences(references, fail) {
  if (references === undefined) {
    return Object.freeze([]);
  }
  if (
    !Array.isArray(references) ||
    !references.every(
      (ref) =>
        ref &&
        typeof ref.title === 'string' &&
        ref.title.trim() &&
        typeof ref.url === 'string' &&
        /^https:\/\/[^\s]+$/.test(ref.url),
    )
  ) {
    fail('references must be a list of { title, url } with https URLs.');
    return Object.freeze([]);
  }
  return Object.freeze(references.map((ref) => Object.freeze({ title: ref.title, url: ref.url })));
}

function validateTestedEnvironment(environment, fail) {
  if (environment === undefined) {
    return null;
  }
  const verifiedAt = parseDate(environment?.verifiedAt);
  if (typeof environment?.summary !== 'string' || !environment.summary.trim() || !verifiedAt) {
    fail('testedEnvironment needs a summary and a verifiedAt date.');
    return null;
  }
  return Object.freeze({ summary: environment.summary, verifiedAt });
}

function validateSeo(seo, fail) {
  if (seo === undefined) {
    return Object.freeze({});
  }
  if (!seo || typeof seo !== 'object') {
    fail('seo must be a mapping.');
    return Object.freeze({});
  }
  for (const key of Object.keys(seo)) {
    if (key !== 'title' && key !== 'description') {
      // Canonical overrides are refused: every article is canonical at its own URL.
      fail(`seo.${key} is not supported.`);
    }
  }
  if (seo.title !== undefined && (typeof seo.title !== 'string' || seo.title.length > 70)) {
    fail('seo.title must be at most 70 characters.');
  }
  if (
    seo.description !== undefined &&
    (typeof seo.description !== 'string' || seo.description.length > 170)
  ) {
    fail('seo.description must be at most 170 characters.');
  }
  return Object.freeze({ title: seo.title, description: seo.description });
}
