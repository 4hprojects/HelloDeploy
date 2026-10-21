# Phase 7 — Static-runtime port field polish

- **Status:** Done
- **Started:** 2026-07-04T05:14:23+08:00
- **Accomplished:** 2026-07-04T05:33:08+08:00
- **Commits:** (this commit)

## Goal

Since Phase 2, activation always serves STATIC/REACT/VUE runtimes on the fixed internal port (nginx-unprivileged listens on 8080) and ignores `buildConfiguration.applicationPort` — but the Detection page still showed an editable "Application port" field for those runtimes, letting owners set a value that silently does nothing.

## Tasks (checklist)

- [x] Detection page: the port input is replaced with a read-only explanation when the detected runtime is STATIC/REACT/VUE ("Static sites are served by nginx on a fixed internal port — this setting doesn't apply to REACT projects."). Node runtimes and undetected projects keep the editable field.
- [x] Verified live: REACT project → no `applicationPort` input, note shown; flipped to NODEJS → input back.
- [x] Lint clean; full suite 548/548.

## Notes

- The template guard (`['STATIC','REACT','VUE'].includes(project.runtimeType)`) mirrors `STATIC_RUNTIME_PORT` in `apps/worker/src/deployment/pipeline.js` rather than importing worker code into a web view. If a runtime is ever added to one list, add it to the other.
- Any previously saved `applicationPort` on a static project remains stored but inert — harmless, and it applies again if detection later reclassifies the project as a Node runtime.

## Verification

1. Live: `GET /projects/onboarding-demo/detection` with `runtimeType: 'REACT'` → 200, zero `name="applicationPort"` matches, explanatory hint present; with `runtimeType: 'NODEJS'` → input present again.
2. `npm test` → 548/548; `npm run lint` clean.
