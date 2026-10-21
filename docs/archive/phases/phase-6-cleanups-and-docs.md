# Phase 6 — Small cleanups + docs batch

- **Status:** Done
- **Started:** 2026-07-03T21:26:00+08:00
- **Accomplished:** 2026-07-04T04:57:55+08:00
- **Commits:** (this commit)

## Goal

The remaining S-effort items from IMPROVEMENTS.md: small efficiency/robustness fixes plus the documentation gaps.

## Tasks (checklist)

### Code

- [x] **Port-allocator race** — `allocatePort(deploymentId)` now claims scan → write → verify: after recording the candidate port it re-checks for a rival non-terminal deployment on the same port; on collision the lower `_id` deterministically keeps the port (no mutual-retry livelock) and the loser retries with a fresh scan (bounded at 5 attempts). Pipeline passes the deploymentId; allocator tests rewritten for the claim semantics (+2 tests, including own-port reallocation)
- [x] **Startup delay polling** — the shared pipeline polls `inspectContainer` every 500 ms within the startup window instead of one flat 3 s sleep; an immediately crashing container fails the deploy as soon as the exit is visible
- [x] **Parallel awaits** — project overview fetches repository / recent deployments / secret names via `Promise.all`. The `deployment.service.js` create/retry chains were inspected and are genuinely dependent (project → repository), so they stay sequential — noted against the backlog item
- [x] **Swallowed errors** — warn log when a domain route-activation enqueue fails and approval is reverted (`domain.service.js`); warn log when the Turnstile verify request fails (an outage would otherwise silently block all sign-ins); debug log on webhook signature buffer errors. `domain.service.js:45` already rethrew a typed validation error — left alone

### Docs

- [x] `docs/ENVIRONMENT.md` — full env-var reference (core, security, platform/routing, GitHub App, worker, email, seeding) sourced from both apps' `config/env.js`
- [x] CLAUDE.md — Architecture section (apps, packages, pipeline stages, infra assumptions, test harness)
- [x] Deleted `WEB_APP_COMPREHENSIVE_ANALYSIS.md` + `TODAY_WEB_APP_REMEDIATION_TODO.md` — both fully checked off and superseded by IMPROVEMENTS.md; nothing referenced them
- [x] FAQ — new "Automation and Operations" section: deploy hooks, build filters, maintenance mode, notification preferences, deploy-without-cache, health-check path
- [x] CONTRIBUTING.md — setup, quality gates, conventions, doc pointers
- [x] IMPROVEMENTS.md checkboxes updated (9 items closed in this phase)

## Notes

- The allocator API changed from `allocatePort()` to `allocatePort(deploymentId)` — it now also writes `containerPort` onto the deployment doc, so the pipeline's follow-up update only sets container/network names.
- Deliberately **not** done here: `getUserProjects` JS-side sort (fine at current scale, per its own backlog note), `requireProjectRole` sequential finds (LOW; two indexed point reads), SSE polling load (deferred with the multi-instance work).

## Verification

1. `node --test 'tests/worker/*.test.js'` → 42/42 (allocator suite rewritten for claim semantics).
2. Full suite `npm test` → **548 tests, 0 failures**; `npm run lint` clean.
3. Runtime surfaces touched (allocator, startup polling) are exercised by the worker job tests through the same pipeline entry points the queue uses; no docker available in this environment for a live deploy (same limitation recorded in Phase 2).
