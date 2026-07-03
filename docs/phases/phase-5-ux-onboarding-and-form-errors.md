# Phase 5 — UX: onboarding checklist + inline form errors

- **Status:** Pending
- **Started:** —
- **Accomplished:** —
- **Commits:** —

## Goal

The two HIGH UX items: (1) new projects drop users on the overview with no guided path to a first deploy; (2) several forms surface failures only as flash banners while others have proper per-field errors.

## Tasks (checklist)

- [ ] Onboarding checklist card on the project overview (`show.ejs`) driven by project state: repo connected → runtime detected → env secrets set → submitted/approved → deployed; each step links to its page
- [ ] Hide or collapse the checklist once the project has deployed
- [ ] Standardize the `form-errors` + per-field error pattern on: build-configuration, build-filters, deploy-hook, maintenance, environment forms
- [ ] Verify in the running app: fresh project shows the checklist; a failing form submit shows inline errors
- [ ] Update IMPROVEMENTS.md checkboxes

## Notes

## Verification
