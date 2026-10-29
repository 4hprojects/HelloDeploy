# Phase 6A — SEO, Search Console and Analytics

## SEO
- Unique title/deck/meta descriptions, canonical absolute HTTPS URL and single H1 per article.
- OG and X card images with verified accessibility and dimensions; social image 1200×630 is practical default, not guarantee of preview.
- Structured `BlogPosting` JSON-LD and `BreadcrumbList`, matching visible author/date/image data; never invent awards, reviews, ratings or dates.
- Sitemap only published indexable canonical URLs with meaningful `lastmod`; robots policy protects unpublished routes; search query result pages generally `noindex`.
- Proper 404 for unknown article, reasonable 301 redirects for renamed slugs, stable article IDs. No empty category indexable pages, avoid soft-404 and duplicate canonicals.
- Links to official references, related tutorials, descriptive alt text, fast mobile images, semantic headings.

## Analytics
Check existing GA4, tag manager, consent and Search Console integration first. Implement one page_view source to avoid duplicate automatic + manual views. Custom events: article_share_click, article_copy_link, comment_submit_outcome (no content/user PII), related_click, optional reading milestones. Measurement ID via env/config; disable until owner config and privacy/consent requirements completed. Internal MongoDB counters are **not** GA4 unique visitors.

## Acceptance
Inspect rendered HTML (not just templates), validate structured data, canonical, article statuses, sitemap, robots, social shares, and consent gating. Confirm 404/redirect behavior and that analytics never receives names/email/comment content or visitor tokens.
