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

## 2026-10-29 — Phase 3 views and sharing

- `ArticleStat` model (`article_stats`, unique `articleId`, `views`, `shareClicks.{facebook,
linkedin,x,copy,native}`), exported from `@hellodeploy/database`. Additive collection.
- `services/learning-hub/article-stats.service.js`: Redis `SET lh:view:<id>:<hmac> NX EX 1800`
  then Mongo `$inc` upsert; increment failure releases the reservation; Redis not ready or
  erroring skips the count; self-identified bots skipped; count reads time out after 1.5 s and
  render without a number.
- Endpoints `POST /blog/api/articles/:id/view` and `/share` (CSRF header, JSON 403 on
  CSRF failure, published ids only, platform allowlist, limiters `rl:article-view` 120/10 min and
  `rl:article-share` 60/10 min, fail closed on store error).
- Flag `LEARNING_HUB_VIEWS_ENABLED` (default false). The view count shows as "N views" with
  the title "Approximate page views, not unique visitors".
- Share rows at the top and end of each article: Facebook, LinkedIn, X links (work without JS,
  `target=_blank rel="noopener noreferrer"`), plus JS-only Copy link (selected text-field
  fallback) and Web Share when supported. Clicks are recorded as clicks, never as shares.
- No-JS readers are not counted (documented in D5).
- Tests: `tests/learning-hub/article-stats.test.js` 18 pass (dedup window, expiry, distinct
  articles, 25 concurrent sessions exact, 10 concurrent duplicates count once, Redis down and
  erroring, reservation release, no raw session id in Redis, bot UA, slug-independent id, store
  failure and hang). `blog-routes.test.js` 33 pass (adds encoding, rel, placement, CSRF, draft
  and forged ids, platform validation). Playwright 33 pass (adds copy, clipboard fallback, Web
  Share present/absent, keyboard-reachable links, one view beacon).
- Resource: one small document per article; Redis keys expire after 30 minutes, at most one per
  article per session.
- Tokens: about 55K (estimate).

## 2026-10-29 — Phase 4 comments core

- `ArticleComment` model (`article_comments`): root `parentId`, actual `replyToCommentId` and
  name snapshot, statuses `published | rejected | hidden | removed`, moderation metadata,
  report counters, unique partial `idempotencyKey`, TTL on `purgeAt` (set only for rejected).
- `comment.service.js`: oldest-first threads, 10 roots per page, 20 visible replies per thread
  with a "show more" link, hidden roots hide their whole thread, counts include only visible
  comments; reply resolution enforces same article, published target, published root, and
  stores replies to replies under the root (one visual level) with the real target kept.
- `comment-input.js`: NFKC, control/bidi/invisible-character stripping, name 2–60, body
  10–2,000, object-id-only reply ids, required submission key.
- Routes `POST /blog/:slug/comments` and `/blog/:slug/comments/:commentId/report`; the open
  check runs before limiters and protections, so a closed discussion answers 503 to any POST.
- Templates `partials/blog/{comments,comment,comment-form}.ejs`; plain-text rendering with
  escaping and `white-space: pre-line`; failed submissions re-render with the text kept and the
  error focused; JS keeps a session-storage draft.
- Tests: `comment-threads.test.js` 28 pass; `comment-routes.test.js` 20 pass (closed/disabled
  503, nothing stored, CSRF, publish redirect, reply, revision keeps text, 4th post 429,
  escaping, one visual level, pause keeps comments readable, report, admin anonymous refused).

## 2026-10-29 — Phase 5 moderation, reporting, enforcement

- `verifyTurnstileStrict` (new; sign-in verifier unchanged): fails closed without a secret,
  checks action and hostname, maps `timeout-or-duplicate` to replay.
- `comment-heuristics.js`, `moderation.js` (`none`, `openai-moderation`, test-only `injected`;
  5 s timeout; errors and timeouts become `unavailable`), `comment-pipeline.js` (ordered gate,
  idempotent replay, 24 h duplicate fingerprints, rejection-spike log at 30 per hour, rejected
  bodies purged after 7 days).
- `ArticleCommentReport` (`article_comment_reports`, one per reader per comment, 90-day TTL);
  reports re-run moderation and only an `unsafe` verdict hides.
- Admin page `/admin/learning-hub` (any admin): pause all / per article (audited
  `admin.learning_hub_comments_paused|resumed`), hide/remove/restore (audited
  `admin.learning_hub_comment_*`), content validation errors shown.
- `PlatformSetting` key `learningHubComments`; unreadable setting ⇒ paused.
- Tests: `comment-protection.test.js` 67 pass: missing, replayed, wrong-action, wrong-host,
  unreachable Turnstile; Redis down; provider none, timeout, throw; outage then resubmit;
  unsafe rejected and purge-scheduled; uncertain asks for revision; no rule disclosure; replay
  and 5 concurrent retries publish once; duplicate text; cross-article reply; staff reply;
  links, bare and "(dot)" domains, Cyrillic lookalikes, zero-width splits, emails (plain and
  obfuscated), PH and international phones, promotion spam, link in name; harsh criticism,
  Filipino troubleshooting, error logs, localhost URL, file names, quoted HTML all publish;
  OpenAI adapter mapping; 30 concurrent reports cannot hide an innocent comment; one report per
  reader; unsafe re-check hides; admin restore/remove; rejected cannot be restored;
  availability for each missing safeguard; unreadable settings close submissions.
  `admin-view.test.js` 5 pass. Playwright 39 pass (adds comment axe coverage, one visual
  level, reply context, staff badge, keyboard report panel, publish in place, refused text
  kept).
- Found and fixed by the suite: `http://localhost:3000` was refused as a link.
- Regression: `tests/security`, `tests/ui`, `tests/admin`, `tests/config`, production check
  → 798 pass after updating `tests/security/rate-limit.test.js` (fail-closed limiter count 8 →
  13 for the five new limiters).
- **Not verified, by design:** real Cloudflare Siteverify and any real moderation provider.
  The harsh-criticism and Filipino cases prove the rules do not block them; whether a real
  provider classifies Filipino abuse correctly is untested. Guest comments stay off.
- Tokens: about 150K for Phases 4–5 (estimate).
