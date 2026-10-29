# Learning Hub — Implementation Log

Append-only. Token figures are estimates unless marked measured.

## 2026-10-29 — Phase 0 audit

- Branch `feat/learning-hub` from `main` `2b54d220344bcbaed94e08b8468480883651b3af`.
- Copied the spec package from the untracked `docs/todo/hellodeploy-learning-hub-complete/` to
  `docs/learning-hub/` (the original folder is left untouched).
- Wrote `PHASE_00_AUDIT_REPORT.md` and `DECISIONS.md` (D1–D6).
- Tests: none needed (documentation only).
- Resource change: none.
- Tokens: about 60K (estimate).
- Next: Phase 1 content foundation.

## 2026-10-29 — Phase 1 content foundation

- Added `markdown-it` 15.0.3 and `yaml` 2.9.1 to `@hellodeploy/web`. 15.0.2 was tried first and
  failed `npm audit` (GHSA-vfgh-jcmw-g37q, GHSA-gfr2-rv44-r23c); 15.0.3 is clean.
- New: `apps/web/src/config/learning-hub.js` (categories, author, redirects, reserved slugs),
  `apps/web/src/services/learning-hub/{markdown,article-schema,content-repository,content-error}.js`,
  `scripts/check-learning-hub-content.js` (`npm run content:check`, added to `ci.yml`),
  `content/blog/articles/`, `docs/learning-hub/AUTHORING.md`.
- Tests: `NODE_ENV=test node --test tests/learning-hub/*.test.js` → 40 pass, 0 fail. Covers
  malformed YAML, missing front matter, unknown author/category/field, duplicate id and slug,
  future and impossible dates, reserved slug, H1 in body, missing alt, broken and draft internal
  links, redirects, raw HTML and unsafe link schemes, duplicate heading ids, determinism.
- `npm audit --omit=dev --audit-level=moderate` exit 0.
- Deferred to Phase 3: `ArticleStat` model (belongs with the view counter).
- Resource change: articles held in memory; size scales with content (five articles, well
  under 1 MB).
- Tokens: about 45K (estimate).

## 2026-10-29 — Phase 2 public UI

- Routes `/blog`, `/blog/category/:slug`, `/blog/:slug` (`routes/pages/blog.routes.js`,
  `controllers/blog.controller.js`), mounted only when `LEARNING_HUB_ENABLED=true` (default
  false); otherwise they fall through to the normal 404. `createApp({ learningHub })` accepts an
  injected repository for tests and the browser fixture.
- Templates `views/pages/blog/{index,category,article}.ejs` and partials
  `views/partials/blog/{article-card,category-nav,pagination}.ejs`. Header gains a "Blog" link
  and the footer a "Learning Hub" link, both only while the hub is enabled.
- `main.css` was 16 bytes under its 110 KB budget, so the blog has its own hashed bundles
  (`css/learning-hub.css` 9.9 KB, `js/learning-hub.js` 2.6 KB) loaded only on `/blog` pages
  through new `pageStyles` / `pageScripts` locals. Budgets 20 KB / 10 KB added.
- `head.ejs`: `og:type` override and `article:published_time` / `modified_time`.
- Behaviour: drafts, unknown articles, empty categories, and out-of-range or non-numeric pages
  return 404; mapped old slugs return 301; search and page > 1 are `noindex,follow`.
- Tests: `NODE_ENV=test node --test tests/learning-hub/blog-routes.test.js` → 22 pass.
  `npx playwright test tests/browser/learning-hub.spec.js` → 27 pass (no page overflow at
  320/375/768/1024/1440 on index, article, category; zero axe violations light and dark; article
  readable with JavaScript disabled; TOC open on wide screens, collapsed and keyboard-operable on
  phones; copy button copies and announces; code scrolls in its own region). 200% zoom is
  covered by the 320–768px widths (a 1280px window at 200% is 640 CSS px).
- Known: the browser fixture now enables the hub, so the header on `landing-1440.png` gains
  "Blog". The visual baselines are regenerated in Phase 8 with the final header.
- Tokens: about 70K (estimate).
