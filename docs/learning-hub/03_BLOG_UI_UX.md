# Phase 2 — Responsive Public Blog UI

## Pages

`/blog` features header, tagline, search (GET or progressive enhancement), published categories, one featured entry, latest article cards, pagination and footer. `/blog/category/:slug` has accurate heading, summaries and paginated relevant articles; no empty indexed taxonomy pages. `/blog/:slug` has breadcrumb, label, H1, deck, genuine author/byline, published/updated date, reading time, view total, share actions, hero, article content, TOC, references if present, author section, related articles, discussion section when feature enabled. Optional `/blog/author/:slug` if sufficient legitimate content.

## Reusable components

Article card, metadata row, responsive TOC, code block with accessible copy, callouts, figures with captions and alt text, responsive tables, author bio, related links, share row, optional comments, safe ad slot. Reuse HelloDeploy layouts, navigation and design tokens. No unrelated theme.

## Mobile and accessibility

Single-column reading layout, 720–780px max readable body, responsive images and scrolling code blocks, touch targets, visible focus, keyboard nav, semantic headings, accessible form errors and status announcements. Desktop TOC may stick only if space exists; mobile TOC collapses. Desktop share rail never clashes with TOC or content; no fixed mobile bar. Support reduced motion, 200% zoom and 320px viewport without page-level overflow.

## Layout order

Breadcrumb → category → title/deck → author/date/reading time/views → share → hero → article/TOC → end share → author → related → discussion → footer. Avoid banners that mimic navigation and excessive ad placements.

## Acceptance

Test routes, accessibility keyboard interaction, images, long titles, 320/375/768/1024/1440 widths, and graceful behavior with JS disabled (reading and fallback share links still usable). Render empty states without invented counts or fake articles.
