# Phase 8: Performance, SEO, and Production Truth

## Objective

Ensure the experience being reviewed is the experience users actually receive and that public pages are fast and discoverable.

## 1. Release Truth

### Problem

A UI improvement is not complete if production is still on an older commit.

### Required Implementation

Expose running commit:

Existing `/health` already returns `commit`.

Add admin UI:

Release
- commit SHA
- application start time
- environment
- expected release when available

Add release verification script:

1. deploy release
2. call `/health`
3. compare returned commit with expected commit
4. call `/ready`
5. verify status 200
6. check public landing page marker
7. record result

Do not mark deployment complete before this passes.

## 2. Public Route Smoke Test

Automate checks:

- `GET /`
- `GET /auth/sign-in`
- `GET /auth/create-account`
- `GET /terms`
- `GET /privacy`
- `GET /security`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /health`
- `GET /ready`

Check:
- expected status
- content type
- no unexpected redirects
- expected title/marker

## 3. Crawler Verification

Test from outside the production host.

Check DNS:

- apex
- www if supported
- wildcard project domain

Check:
- A/AAAA/CNAME behavior
- Cloudflare proxy state
- TLS certificate
- canonical redirect policy

## 4. Core Web Vitals

Target at 75th percentile:

- LCP <= 2.5s
- INP <= 200ms
- CLS <= 0.1

Measure mobile and desktop separately.

## 5. Asset Strategy

Current static assets use a modest cache lifetime because filenames are not hashed.

Improvement:

- content-hash CSS/JS assets during build
- serve hashed assets with long immutable cache
- keep HTML uncached or short-cache as appropriate

Do not set one-year immutable cache on non-hashed filenames.

## 6. CSS

Current CSS is split into:
- tokens
- base
- layout
- components
- auth

Maintain this modularity.

During improvement:
- remove obsolete component classes only after searching all templates
- avoid page-specific inline styles
- prevent repeated one-off utility classes from becoming an unstructured second design system

## 7. JavaScript

Keep enhancement lightweight.

Prefer server-rendered HTML for initial state.

Use client JS for:
- drawer
- dialogs
- status polling
- live logs
- copy buttons
- progressive enhancement

Do not rebuild the product as a SPA solely for UI polish.

## 8. Images

For product screenshots:
- crop to relevant UI
- compress
- provide dimensions to avoid CLS
- use WebP/AVIF where reasonable
- include descriptive alt text when informative
- decorative images use empty alt

## 9. SEO Page Requirements

Public pages only.

Each:
- unique H1
- unique title
- meta description
- canonical URL
- semantic headings
- indexable body content

Do not create thin SEO pages only for keywords.

## 10. Sitemap

Generate from public route registry or an explicit public-page list.

Exclude:
- dashboard
- projects
- admin
- authenticated settings
- callback routes
- API endpoints

## 11. robots.txt

Explicitly allow intended public content.

Disallowing private pages in robots is not access control.

Authentication remains the security boundary.

## 12. Structured Data

Only add schema that truthfully matches the content.

Potential:
- SoftwareApplication
- Organization/Person operator only if data is accurate
- FAQPage only when current search-engine guidance and page structure justify it

Do not add fabricated ratings, pricing, reviews, or availability.

## 13. Social Preview

Create a branded Open Graph image.

Include:
HelloDeploy
short deployment value proposition
clean dashboard visual or brand graphic

Test common preview aspect ratio.

## 14. Error Pages

404:
- explain page not found
- Dashboard/Home action
- Projects action when signed in

500:
- clear error message
- retry/home
- correlation ID for support if safe

503:
create a dedicated service unavailable experience when readiness fails at the edge/proxy layer where feasible.

## 15. Monitoring UX

External uptime should test more than process existence.

Recommended checks:
- `/ready`
- landing page
- one controlled canary deployment URL when practical

Monitor:
- availability
- latency
- TLS expiry
- DNS

## Acceptance Criteria

- Production `/health` commit matches intended release.
- `/ready` returns healthy after release.
- Public crawler smoke checks pass.
- `robots.txt` and `sitemap.xml` are available.
- Public pages have unique metadata.
- Main pages target good Core Web Vitals.
- Hashed assets use appropriate immutable caching.
- Error pages give useful next actions.
- Public status/monitoring has an off-host signal.
