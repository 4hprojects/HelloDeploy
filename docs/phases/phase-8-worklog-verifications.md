# Phase 8 — WORKLOG verification items

- **Status:** Done (1 item needs one manual command — see Notes)
- **Started:** 2026-07-04T05:33:30+08:00
- **Accomplished:** 2026-07-04T05:37:45+08:00
- **Commits:** (this commit)

## Goal

Close the WORKLOG.md verification checkboxes that are verifiable in this environment: real Resend provider delivery, browser/integration evidence for the deployment options, and a smoke-test checklist for the docker-capable host.

## Tasks (checklist)

- [x] Deployment-options evidence gathered live (see Verification) — WORKLOG line checked off
- [x] `docs/RELEASE_SMOKE_TEST.md` — copy-paste checklist validating the non-root images (static + Node + rollback) on a docker-capable host
- [x] WORKLOG.md updated with evidence and pointers
- [ ] **Resend provider delivery — needs one manual command** (see Notes); everything up to the provider boundary is already test-covered

## Notes

**Resend end-to-end:** the agent environment's safety policy blocks sending real external email autonomously (recipient not explicitly user-named). The prepared script composes a genuine notification through the app's own `buildDeploymentNotificationEmail` and sends via the `.env` Resend key, printing only the provider-accepted response id. To close WORKLOG P8-06, run from the repo root:

```bash
node "$PRIVATE_RESEND_E2E_SCRIPT"
```

(or re-create it — 30 lines, imports `buildDeploymentNotificationEmail`, sends to the owner address, prints `ACCEPTED id: …`), then confirm the inbox copy and tick the WORKLOG box.

## Verification

Driven live (dev harness :3210, project `onboarding-demo`, ACTIVE, repo `lastCommitSha = c0ffee…0001`):

1. ✅ `GET /projects/onboarding-demo/deployments` → 200; three forms POST to `/deployments`, the no-cache variant carries hidden `noCache=true`.
2. ✅ POST deploy-latest (default) → 302 to the new deployment; BullMQ job `deploy-6a482b3a…` payload: `{ noCache: false, commitSha: c0ffee…0001, runtimeType: NODEJS, imageTag: hellodeploy-onboarding-demo-c0ffee0-1 }`.
3. ✅ POST deploy with `noCache=true` (after failing A, honoring the one-in-flight rule) → job `deploy-6a482b60…` payload `{ noCache: true, commitSha: c0ffee…0001 }`.
4. ✅ POST retry on FAILED deployment A → new deployment #3 QUEUED with the original commit; payload `{ noCache: false, commitSha: c0ffee…0001 }`.
5. 🔍 One-in-flight rule observed: the second deploy required failing the first — matching `findInFlightDeployment` behavior.
6. `npm run lint` clean (no source changes this phase beyond docs).
