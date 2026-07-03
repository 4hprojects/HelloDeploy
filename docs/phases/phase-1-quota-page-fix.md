# Phase 1 — Fix broken admin quota page

- **Status:** Done
- **Started:** 2026-07-03T09:34:04+08:00
- **Accomplished:** 2026-07-03T10:28:42+08:00
- **Commits:** (this commit)

## Goal

Every request to `/admin/quotas/:scopeType/:scopeId` returned 500 because `apps/web/src/views/pages/admin/quota.ejs` used wrong EJS include depths (`../../../partials/...` instead of `../../partials/...`). Found while verifying commit `6eeaffa`. Restore the quota-override page.

## Tasks (checklist)

- [x] Fix the `csrf-field` include path in quota.ejs
- [x] Remove the redundant `flash-banner` include (the layout already renders it; sibling admin pages don't re-include it)
- [x] Scan all views for the same wrong-depth include pattern — quota.ejs was the only file affected
- [x] Verify the page renders with an authenticated admin session in the running app
- [x] Lint clean

## Notes

- The layout (`layouts/main.ejs:11`) already includes `flash-banner`, and no other page view re-includes it, so the broken flash-banner include was removed rather than corrected — correcting it would have rendered the banner twice.
- `grep -rn '\.\./\.\./\.\./partials' apps/web/src/views` confirmed the wrong-depth pattern existed only in quota.ejs (2 occurrences).

## Verification

Driven in the running app (mongodb-memory-server + seeded super admin, dev server on :3210):

1. Signed in as super admin → 302 to /admin.
2. `GET /admin/quotas/user/64b7f8e2a1c9d4f5b6a7c8d9` → **200**, `<title>Quota Override — HelloDeploy</title>` (was 500 with "Could not find the include file" before the fix).
3. Submitted the quota form (`maxOwnedProjects=5`, reason set) → 302 back to the quota page (success flash flow) — proves the corrected `csrf-field` include renders a working token.
4. `GET /admin/quotas/user/still-not-an-id` → 404 (Phase-0 ObjectId guard still intact).
5. `npm run lint` clean.
