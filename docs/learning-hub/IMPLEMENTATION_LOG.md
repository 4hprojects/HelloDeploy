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
