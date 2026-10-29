# Phase 1 — Article Architecture and Data Contract

## Content contract
Article source lives in repository Markdown files, parsed by a maintained library selected in audit. Front matter fields: immutable `id`, `slug`, `title`, `description`, `category`, `tags`, `authorId`, `status` (`draft` or `published`), `featured`, `publishedAt`, `updatedAt` (only meaningful revision), `heroImage`, `socialImage`, `difficulty`, `commentsEnabled`, optional verified environment and SEO overrides. Validate required fields and unique id/slug at startup/build. Dates must be valid, publication must not be future unless explicitly scheduled through future capability, and external canonical overrides disallowed by default.

## Architecture
- Repository interface: listPublished, findPublishedBySlug, listByCategory, listByAuthor, getRelated; future CMS adapter not implemented.
- Exclude drafts from all public routes, search, related content, sitemap, structured data, and feeds. Direct draft URL returns 404 absent authorized preview functionality.
- Parse Markdown to **sanitized** HTML. Disable raw HTML by default; escape untrusted interpolation; safe URL protocols only. Code content should render text rather than executable markup.
- Derive TOC and heading anchors deterministically; single article H1 controlled by template; Markdown headings start at H2. Handle duplicate heading IDs.
- Category registry and author registry (genuine identity and credentials only), article SEO fields, reading-time approximation, and related-articles selection with stable ordering.
- Correct statuses: 404 for missing, 301 for explicitly mapped renamed slugs, valid routes do not collide with `/blog/category` or reserved paths.
- Include content validation CLI/CI command and docs for adding and revising an article.

## Persistence boundary
Markdown and source metadata remain Git-managed. MongoDB stores counters and comments keyed by immutable article ID, never slug alone. Slug changes must retain stats/discussions using article ID. Index new collections; document migration and rollback steps. Do not change auth source.

## Acceptance
Validate malformed YAML, missing author/category, duplicate slug, draft leakage, unsafe Markdown, invalid internal links. Sample article renders deterministically and server starts without new external CMS dependency.
