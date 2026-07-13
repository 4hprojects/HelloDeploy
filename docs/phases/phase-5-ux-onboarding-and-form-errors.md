# Phase 5 — UX: onboarding checklist + inline form errors

- **Status:** Done
- **Started:** 2026-07-03T21:12:00+08:00
- **Accomplished:** 2026-07-03T21:23:06+08:00
- **Commits:** (this commit)

## Goal

The two HIGH UX items: (1) new projects dropped users on the overview with no guided path to a first deploy; (2) several forms surfaced failures only as flash banners while others had proper per-field errors.

## Tasks (checklist)

- [x] "Get your app live" checklist card on the project overview: connect repo → detect runtime → add secrets (optional) → submit for review → first deploy. Driven by `repositoryId` / `runtimeType` / secret count / `status` / `activeDeploymentId`; owner-only; hidden after the first successful deploy; done steps get a green check + strikethrough, pending steps link to the right page; a "N of 5 done" counter sits in the card header. `#submit-review` anchor added to the existing submit card.
- [x] Build-configuration form (detection page): re-renders with `form-errors` summary + per-field errors and sticky submitted values instead of flash-and-redirect
- [x] Build-filters form: same treatment (includedPaths/ignoredPaths)
- [x] Maintenance-mode enable form (overview): message-length error now renders inline under the field
- [x] Environment form: per-field errors for name and value (controller pre-validates via the now-exported `validateSecretName`); service-level failures still land in the `form-errors` summary
- [x] Environment `.env` upload: owners can import up to 100 variables from a bounded 64 KB file while retaining one-at-a-time entry; the complete file is validated before writes and secret values are never echoed in errors
- [x] Secret reveal and editing clarity: reveal is an audited owner-only action, Show/Hide is identified as visual masking, Clear removes plaintext from the page, environment responses are `no-store`, and the inline stored-secret editor never loads current values into replacement inputs
- [x] Deploy-hook forms assessed and intentionally left on flash: generate/revoke are button-only actions with no input fields to attach errors to — flash is the standard surface for field-less actions (same as maintenance disable, archive, etc.)
- [x] IMPROVEMENTS.md checkboxes updated

## Notes

- `getProject` was refactored into a reusable `renderProjectOverview(req, res, extras)` so the maintenance error path can re-render the full overview; `getDetection` similarly became `renderDetection`. Both wrappers are explicit `(req, res) =>` lambdas because `asyncHandler` passes `next` as a third argument, which would silently occupy the `extras`/`deps` slot.
- Onboarding checklist styles added to `components.css` using existing tokens (`--color-green`, spacing scale); no new hardcoded values. Screen-reader text uses the existing `sr-only` class.
- The secret-count query for the checklist only runs while the project has no active deployment, so established projects pay nothing.

## Verification

Driven live (in-memory Mongo + seeded super admin, dev server :3210):

1. Created project "Onboarding Demo" → overview shows **"Get your app live — 0 of 5 done"** with all five steps linked.
2. Added secret + connected repo (seeded) → checklist shows **"2 of 5 done"** with two struck-through steps.
3. Secret name `1BAD` → 200 re-render, inline `name-error` "must not start with a digit", field gets `form-input--error`. Empty value → inline `value-error`. Valid secret → 302 + success flash.
4. Build command containing a newline (`RUN evil` injection shape) + port 99999 → both `buildCommand-error` and `applicationPort-error` render inline, and the valid `startCommand` value stays sticky. Valid config → 302 + flash.
5. 21 ignored-path patterns → inline `ignoredPaths-error` "No more than 20…".
6. Maintenance message of 250 chars → 200 re-render of the full overview (checklist intact) with inline `maintenance-message-error`.
7. `npm test` → 546 pass; `npm run lint` clean.
