# Phase 9 — Selected-commit deployment path

- **Status:** Done
- **Started:** 2026-07-04T05:38:30+08:00
- **Accomplished:** 2026-07-04T05:43:06+08:00
- **Commits:** (this commit)

## Goal

WORKLOG recorded the gap: deploy-latest and retry-current existed, but there was no way to deploy a chosen commit. The worker already clones exact SHAs (`cloneExactCommit`), so this is web-side only.

## Tasks (checklist)

- [x] `createDeployment` accepts an optional `commitSha` override: trimmed, lowercased, validated against `/^[0-9a-f]{40}$/`; invalid input returns `{ error, errorField: 'commitSha' }` before touching the DB. The override flows into the deployment record (`commitMessage` null — unknown for arbitrary commits), the image tag, and the job payload.
- [x] Deployments page: "Deploy a Specific Commit" card (owner/maintainer) with a 40-char SHA input; malformed input re-renders the list page with an inline field error and sticky value (Phase 5 pattern), other failures keep the flash path.
- [x] Tests: `tests/deployment/selected-commit-deploy.test.js` (5) — short SHA rejected with field scope, non-hex rejected, valid SHA passes validation (fails later on the missing project, proving order), uppercase normalized, null override means deploy-latest.
- [x] WORKLOG.md selected-commit line checked off with evidence.

## Notes

- Validation runs first in the service so every caller (UI now, API/CLI later) gets the same contract; the `errorField` key is how controllers distinguish field-attributable errors from flash-worthy ones.
- A commit picker fetched from the GitHub API would be nicer than a raw SHA input but needs installation-token plumbing on the web side — noted as a future enhancement, not scheduled.
- Caught during verification: the dev server had been started before the code changes, so the first drive exercised stale code (EJS views hot-reload in dev; controllers/services do not). Restarted and re-drove.

## Verification

Live (dev harness :3210, project `onboarding-demo`):

1. ✅ Deployments page renders the new card (1 match).
2. ✅ POST `commitSha=deadbeef` → **200** re-render, inline `commitSha-error` "Commit must be a full 40-character SHA (lowercase hex).", sticky `value="deadbeef"`.
3. ✅ POST `commitSha=BADA55…0002` (uppercase) → 302 to the new deployment; BullMQ payload `{ commitSha: 'bada55…0002', noCache: false, imageTag: hellodeploy-onboarding-demo-bada550-5 }`; Deployment doc `commitSha` matches, `commitMessage: null`, status QUEUED.
4. 🔍 One-in-flight rule still applies to selected-commit deploys (stray QUEUED deployment had to be cleared first).
5. `npm test` → **553/553** (+5); `npm run lint` clean.
