# HelloDeploy and HelloRun Production Plan

Updated: 2026-08-08

## Primary Goal

Complete HelloDeploy's real production deployment workflow and use that workflow to
successfully host HelloRun.

HelloRun must be checked, approved, built, deployed, health-checked, routed, updated,
and rolled back by HelloDeploy. Its existing independent PM2 process is a temporary
fallback, not evidence that HelloDeploy can host applications.

> **Current safety rule:** Do not start a HelloRun or customer deployment while the
> production worker is unavailable. A deployment may be recorded and queued, but no
> worker can build or activate it. DNS verification jobs must also remain paused or be
> deliberately requeued only after the worker and routing plane are ready.

## Success Criteria

This goal is complete only when all of the following are directly demonstrated:

- The HelloDeploy web service, worker, Docker execution plane, constrained Nginx
  helper, Redis queues, and wildcard application ingress are operational under their
  intended production identities.
- `hellorun-e783` has a current successful application check, current approval
  snapshot, approved project state, and healthy deployment produced by HelloDeploy.
- HelloRun serves HTTPS traffic through its platform address at
  `hellorun-e783.hellodeploy.online` and its custom address at
  `hellorun.online`.
- A safe HelloRun update succeeds, an intentionally broken candidate leaves the
  healthy release serving traffic, and retained-image rollback is proven.
- A second supported project completes the same workflow without a manual server
  deployment.
- Backup restoration, upgrade rollback, interruption handling, monitoring, and the
  final production release gate have direct evidence.

Customer application hosting remains **NO-GO** until every priority and release gate
in this document is complete.

## Document Ownership

This plan owns the goal-specific execution order for completing HelloDeploy and
hosting HelloRun. It does not replace the repository's established status and
evidence documents:

- The [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md) remains the
  authoritative source for production-readiness status, blockers, and completion
  gates.
- The [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) remains the
  source for release requirements and the final GO/NO-GO rule.
- The [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md) remains the
  authoritative record of direct live results.
- The [Worklog](../WORKLOG.md) remains the detailed historical evidence record.
- The [Operations Runbooks](OPERATIONS_RUNBOOKS.md) remain authoritative for
  approved operator procedures.

When this plan and an authoritative source disagree, stop and reconcile the
authoritative source before continuing.

## Status Contract

Use the batch tracker's statuses for priorities:

- `Not Started`: execution has not begun.
- `In Progress`: safe implementation or verification is active.
- `Blocked`: an external dependency, privileged action, or prior gate is missing.
- `In Review`: implementation is complete and final verification is pending.
- `Complete`: every checklist item, evidence requirement, and completion gate passes.

Statuses in this plan summarize the goal sequence. Readiness status changes must also
be recorded in the batch tracker.

## Priority Overview

| Priority | Outcome                                        | Current status | Required before                |
| -------- | ---------------------------------------------- | -------------- | ------------------------------ |
| P0       | Recoverable current pilot                      | Complete       | Any host mutation              |
| P1       | Isolated production service foundation         | Complete       | Worker or routing activation   |
| P2       | Operational worker, queues, and public routing | In Progress    | Real application deployment    |
| P3       | Proven secure deployment engine                | Not Started    | HelloRun production deployment |
| P4       | HelloRun hosted by HelloDeploy                 | Not Started    | Other customer projects        |
| P5       | Repeatable owner workflow                      | Not Started    | Customer-hosting GO            |
| P6       | Recovery evidence and formal production GO     | Not Started    | General availability           |

Priorities run in order. Work from a later priority may reduce local risk, but it
cannot satisfy or bypass an earlier live gate.

## P0 - Protect the Existing Pilot

**Status:** Complete

**Dependencies:** Current host access, reviewed release identity, backup media, and
recovery-key access.

**Tracker mapping:** Priority 1 Safe In-Place Baseline; Batches 1 and 5; Roadmap
Phases 0, 1, and 5.

**Execution update:** The clean merged candidate
`2ed2f4ea390d32267820fee4d854b3aa2f7d11f6` incorporates the reviewed fallback
recovery evidence; its parent release passed the complete Node.js 22 release gate,
and PR #13 passed Node.js 22 CI. A manual PM2 dashboard restart cleared the stale
frontend release and the
complete public production check now passes. The original dedicated `hellorun`
tunnel was healthy but belonged to a different Cloudflare account from the
`hellorun.online` zone. A separate root-protected connector was created in the
correct account without replacing either existing tunnel service. Its published
application route and proxied root DNS record now send `hellorun.online` to the
existing PM2 fallback through `http://localhost:80`. Authoritative DNS, repeated
HTTPS 200 responses, HSTS, local-origin health, the complete dashboard production
check, and zero connector restarts passed.

The installed Cloudflare management credential is scoped to `hellodeploy.online`,
not the separately managed `hellorun.online` zone. A route command therefore created
an unintended hostname in the wrong zone instead of changing the target domain. That
record was immediately removed and its absence confirmed through the authoritative
zone API. The intended domain remained unchanged; its repair requires a
`hellorun.online` zone-scoped dashboard or API action. That action was subsequently
completed through a separate remotely managed tunnel in the correct account.

The final P0 capture used the approved LUKS2 off-host medium, MongoDB Database Tools
`100.17.0` verified against MongoDB's signing key, a non-restoring database export,
root-owned rollback instructions, and supplemental current HelloRun routing state.
The encrypted artifact passed its outer checksum after a lock/remount cycle, the
separately held recovery export passed its checksum and secret-key import, and the
repository verifier decrypted the artifact and passed its bounded inventory and
every internal checksum. Both media were safely unmounted and physically removed.
The recovery USB has consistent key files but pre-existing FAT metadata differences;
keep it read-only and do not repair the sole private-key copy until a second verified
copy exists.

### Actions

- [x] Select a reviewed immutable HelloDeploy commit from a clean checkout.
- [x] Capture a current value-safe host baseline covering platform, release,
      prerequisites, services, identities, routing, health, and blockers.
- [x] Create an encrypted off-host backup of MongoDB, protected configuration,
      GitHub App material, Nginx, Cloudflare Tunnel configuration, managed routes,
      and required application state.
- [x] Verify the archive inventory, checksums, database export, recovery key, and
      non-restoring backup verifier.
- [x] Record the exact rollback path for the PM2 dashboard, independent HelloRun
      process, Nginx, tunnel configuration, repository release, and queue state.
- [x] Inventory deployment and DNS jobs created while the worker was offline.
- [x] Identify stale deployment jobs for cancellation and valid DNS checks for
      deliberate requeue after P2.
- [x] Run the supported local quality and configuration gates against the selected
      release.

### Stop Conditions

- Current dashboard or HelloRun health fails.
- The checkout is dirty, mutable, or does not match the intended release.
- Backup integrity, database evidence, recovery-key access, or rollback preparation
  fails.
- The queue contains work whose ownership or intended outcome cannot be established.

### Required Evidence

- Sanitized baseline report and immutable full commit.
- Encrypted backup verification and database-export result.
- Root-controlled rollback instructions and approved rollback destination.
- Sanitized queue inventory with a recorded decision for each stale job class.
- Local configuration, security, installer, Nginx, worker, lint, formatting, and test
  results.

### Completion Gate

The current dashboard and HelloRun remain healthy, the target release is
reproducible, the backup is recoverable, and every planned P1 host change has a
verified rollback.

**Gate result:** Passed on 2026-07-31. This is same-host retrieval proof, not the P6
second-host restoration gate.

## P1 - Install the Production Service Foundation

**Status:** Complete

**Dependencies:** P0 Complete; approved Ubuntu 26.04 candidate-host acknowledgements;
privileged access.

**Tracker mapping:** Production Service Foundation; Batches 2, 3, and 5; Roadmap
Phases 2, 3, and 5.

**Execution update:** Pre-mutation inspection found the pilot running Node.js 24 even
though the production contract requires Node.js 22. Preflight accepted every major
at or above 22, and the installer would preserve 24. The candidate procedure now
requires exactly major 22, deliberately permits the package downgrade needed on the
pilot, and verifies the installed major before continuing. This correction must
merge before the prepare-only installer runs. The first host attempt then stopped on
an obsolete installation-media APT source before mutation. After disabling that
source, preparation installed Docker, the system Node.js 22 runtime, isolated
identities, and protected state while leaving all HelloDeploy units disabled. A retry
exposed that an identical already-installed reviewed configuration blocked safe
continuation after a partial run. The installer now preserves only a byte-for-byte
match and still rejects any changed file. This correction must merge before the
inactive preparation resumes. The corrected preparation then passed every inactive
verifier check. A controlled helper/web start passed local health and readiness and
left routes and the worker unchanged, but systemd had to kill the web process after
its 30-second stop deadline even though application cleanup logged completion. The
signal path now exits explicitly after cleanup, using zero only for successful
shutdown. This correction must pass a real start/stop retest before P1 completes.
Merge `704cb75a02d76a36a88d155a37052df4464bf1a2` then passed that
real retest: health and readiness succeeded, the helper socket had the intended
ownership, routes and the worker remained unchanged, and systemd recorded a clean
zero-status shutdown in about one second. The PM2 dashboard and HelloRun fallback
remained healthy throughout.

### Actions

- [x] Install Docker using the reviewed candidate-host procedure.
- [x] Run the inactive prepare-only installer path before enabling services or
      changing ingress.
- [x] Create separate `hellodeploy-web`, `hellodeploy-worker`, and Nginx-helper
      identities and systemd units.
- [x] Install the reviewed configuration and GitHub App key with minimum required
      ownership and permissions without regenerating existing secrets.
- [x] Configure build workspace storage, Docker networking, loopback-only published
      ports, application port allocation, and resource limits.
- [x] Grant Docker access only to the worker identity.
- [x] Prove the web identity cannot access Docker, the route helper, worker-only
      configuration, or deployment workspaces.
- [x] Validate MongoDB, Redis, Docker, configuration, capacity, readiness, and
      graceful shutdown while the new units remain inactive.

### Stop Conditions

- The installer repairs unexpected permissions, changes ingress, regenerates
  secrets, or enables a service during prepare-only execution.
- The web identity receives Docker or helper access.
- A protected file is readable by an unintended identity.
- Docker, MongoDB, Redis, configuration validation, or candidate-port checks fail.
- The existing PM2 dashboard or HelloRun fallback becomes unavailable.

### Required Evidence

- Installed identity, group, unit, file, directory, and socket metadata without
  protected values.
- Explicit web-denial and worker-allow results for Docker and the helper boundary.
- Docker and production-configuration diagnostics.
- Candidate service startup and shutdown results without traffic cutover.

### Completion Gate

The isolated production units and protected files pass all permission and
configuration checks while the existing PM2 services continue serving traffic.

**Gate result:** Passed on 2026-07-31. The services remain disabled and stopped;
worker activation and queue processing belong to P2.

## P2 - Activate Worker, Queues, and Public Routing

**Status:** In Progress

**Dependencies:** P1 Complete; Cloudflare access; authoritative DNS access; working
Nginx configuration.

**Tracker mapping:** Routing and Production Cutover; Batches 2, 3, and 5; Roadmap
Phases 2, 3, and 5.

### Actions

- [x] Pause deployment and domain queues before starting the production worker.
- [x] Cancel stale deployment jobs so old clicks cannot trigger unexpected builds.
- [x] Keep valid DNS jobs paused until application routing is ready.
- [x] Install and start the constrained Nginx helper and managed route directory.
- [ ] Validate route creation, replacement, removal, candidate rejection, Nginx
      reload failure, and prior-route restoration.
- [x] Add `*.hellodeploy.online` to authoritative DNS and Cloudflare Tunnel
      ingress while retaining the dashboard routes.
- [x] Start candidate web and worker services under their intended identities.
- [ ] Verify web readiness, protected worker readiness, Nginx syntax, secure session
      cookies, wildcard DNS, wildcard HTTPS, and test application routing.
- [ ] Cut dashboard traffic from PM2 to the isolated web service only after candidate
      checks pass.
- [ ] Resume queues gradually, deliberately requeue valid DNS checks, and observe
      failures, latency, Docker capacity, and route changes.

### Stop Conditions

- Queue state is unknown, a stale job starts unexpectedly, or pause/drain behavior
  fails.
- Nginx validation or rollback fails.
- Wildcard DNS or Cloudflare ingress displaces the dashboard.
- The web identity can reach privileged deployment controls.
- Candidate readiness, secure-cookie behavior, or rollback verification fails.

### Required Evidence

- Queue pause, inventory, cancellation, controlled resume, and job-processing results.
- Nginx helper permissions and route transaction results.
- Sanitized DNS, HTTPS, tunnel, dashboard, web-readiness, and worker-readiness
  results.
- Successful restoration of the former PM2/tunnel path during a controlled rollback
  check.

### Completion Gate

A controlled test container is reachable through the wildcard application domain,
the isolated worker processes jobs, the dashboard remains healthy, and the previous
traffic path can be restored.

**Current evidence:** On 2026-07-31 the production worker remained inactive while the
combined deployment/domain queue was paused and drained. Sanitized inventory found no
deployment jobs to cancel and one valid pending DNS-verification job, which remains
paused. Its stored references, pending state, default verification mode, and TXT-proof
presence are internally consistent. The job will not be processed until the routing
and controlled-resume gates pass. The constrained helper is now active and enabled;
live worker-identity checks passed route creation, replacement, invalid-candidate
rejection with prior-route restoration, and removal. No probe file or listener
remains, both public pilot applications pass, and the worker and queue remain
inactive/paused.

**2026-08-01/08-02 wildcard-ingress evidence:** The first live wildcard-ingress attempt
validated the immutable release and routing foundation, then failed candidate
validation because the generated Cloudflare Tunnel YAML left the wildcard hostname
unquoted, which YAML parses as an alias. Automatic rollback restored both connector
configurations; the helper stayed active and enabled, the worker stayed inactive, and
the dashboard and independent HelloRun fallback stayed healthy throughout. The
hostname generator now quotes the wildcard value. A second attempt passed candidate
validation and connector restart but did not reach its terminal success check before
rollback; reproducing candidate generation without host mutation separately confirmed
Cloudflare accepts the quoted rule in both configurations, narrowing the defect to the
post-restart convergence wait. A bounded 60-second convergence wait for both public
fallbacks was added. Wildcard DNS is still absent and a live retry is pending.

**2026-08-05 wildcard-ingress activation evidence:** The installed release at
`/opt/hellodeploy` was updated to the corrected candidate
`e642d0769faca1d8fcb264fe0ee105c5aced4811`, requiring no dependency change or service
restart. With the worker inactive, the helper active, and both public fallbacks
healthy, the live retry passed every stage: queue pause checks, wildcard candidate
generation and Cloudflare validation, both connector config installs and restarts,
wildcard rule verification on both configurations, and the bounded public convergence
wait. Both dashboard connectors stayed active, both public fallbacks passed, the
worker stayed inactive, the queue stayed paused, and a pre-activation configuration
backup was created. This command adds only local Cloudflare Tunnel ingress rules;
wildcard DNS remains unchanged and absent, and starting candidate web/worker services
is the next action.

**2026-08-06 candidate service activation evidence:** A first live attempt failed at
the session-cookie check: an unauthenticated `GET /` didn't complete within 5
seconds, traced via `journalctl` to a session-store write still pending when the
script's rollback stopped the candidate services, racing the web app's shutdown,
which closed the MongoDB connection before that write finished and surfaced as an
unhandled `MongoExpiredSessionError`. Rollback itself worked correctly; the live PM2
dashboard and HelloRun fallback were never touched. Both root causes were fixed:
graceful shutdown now waits for pending session-store writes before closing the
database, and the script's session-cookie timeout widened to tolerate a legitimate
cold first write. The retry against the corrected release passed every stage:
`hellodeploy-web` and `hellodeploy-worker` started under their intended identities,
web health/readiness, the secure session cookie, worker readiness, Nginx syntax, and
a queue-pause recheck. Both services are active as transient candidates (not
enabled, no boot persistence), the queue remains paused, and no dashboard traffic has
been cut over. Adding the wildcard DNS record is the next action.

**2026-08-08 wildcard domain restructure evidence:** Verifying the wildcard DNS
record found it consistently failed its TLS handshake — the account's free
Cloudflare certificate covers only `hellodeploy.online` and `*.hellodeploy.online`,
not the second-level `*.apps.hellodeploy.online` this platform used. Restructured
to `*.hellodeploy.online`; Nginx routing is domain-agnostic, so this was config
defaults, two infra scripts, tests, and docs, not application logic. The live
migration passed: the old wildcard rule was cleanly removed, the new one activated,
and its DNS record added. A first candidate-services retry failed at
`worker-ready`, traced to a stale systemd `ReadWritePaths` bind-mount on the Nginx
helper breaking daily after log rotation (fixed, unrelated to the domain change);
the retry after that passed web readiness, worker readiness, the secure session
cookie, and Nginx syntax. A public wildcard HTTPS probe now returns a real
TLS-terminated response, confirming the certificate gap is resolved — real
application routing under the wildcard is still unverified pending P3. Separately,
the repository-run PM2 pilot was found crash-looping from a mismatched
`DEPLOYMENT_DOMAIN`/`PLATFORM_SUBDOMAIN_SUFFIX` pairing in its `.env` (from the same
migration's manual edit); corrected and self-healed. Dashboard traffic cutover and
queue resume are the next actions.

## P3 - Validate the Real Deployment Engine

**Status:** Not Started

**Dependencies:** P2 Complete; controlled sample repositories; production routing.

**Tracker mapping:** Batch 6 Real Deployment Validation; Roadmap Phase 6.

### Actions

- [ ] Deploy Static, React, Vue, Express, generic Node.js, and supported Next.js
      fixtures through the real worker.
- [ ] Verify exact-commit checkout, safe generated Dockerfiles, build logs, health
      checks, activation, application URLs, notifications, retention, and cleanup.
- [ ] Confirm containers run non-root, enforce CPU and memory limits, and publish
      host ports only on loopback.
- [ ] Confirm environment secrets do not appear in build output, deployment logs,
      image history, process arguments, or errors.
- [ ] Exercise symlink escapes, oversized contexts, dangerous configuration, command
      injection attempts, and hostile startup behavior.
- [ ] Exercise failed builds, failed health checks, cancellation, retry, concurrent
      port allocation, Docker interruption, and worker restart.
- [ ] Confirm a failed candidate never replaces a healthy release.
- [ ] Confirm retained-image rollback restores the intended release and route.

### Stop Conditions

- Secret exposure, unsafe container privilege, non-loopback publication, missing
  limits, path escape, or command injection succeeds.
- A failed candidate displaces a healthy release.
- Cleanup leaves unsafe workspaces, images, containers, ports, or routes.
- An unresolved critical or high-severity defect is found.

### Required Evidence

- Sanitized build, container, health, routing, cleanup, and rollback results for every
  supported runtime.
- Container identity, binding, and resource-limit inspection.
- Failure and interruption outcomes with correlation IDs but no secrets.
- Focused and full repository verification after any fixes.

### Completion Gate

Every supported runtime serves through production routing, security boundaries hold,
failure cleanup is complete, and rollback restores service.

## P4 - Host HelloRun Through HelloDeploy

**Status:** Not Started

**Dependencies:** P3 Complete; current HelloRun repository access; administrator and
Owner workflow access; authoritative DNS and Cloudflare access.

**Tracker mapping:** Batch 7 Pilot and Recovery Drills; Roadmap Phase 7.

### Actions

- [ ] Request changes on the legacy `hellorun-e783` approval request with a clear
      resubmission note.
- [ ] Confirm the start command, application port, working-page path, production
      branch, and current repository commit.
- [ ] Run **Check again** and confirm detection is Ready for the current commit.
- [ ] Resubmit with a short application purpose so the request contains a current
      review snapshot.
- [ ] Approve the current snapshot transactionally and confirm the project becomes
      Active.
- [ ] Start one manual deployment and follow queued, validating, building, deploying,
      health-checking, and healthy states.
- [ ] Verify deployment logs, notifications, resource limits, and
      `hellorun-e783.hellodeploy.online`.
- [ ] Deploy a safe update and confirm the new healthy release replaces the prior
      release.
- [ ] Deploy an intentionally broken candidate and confirm the healthy release stays
      live.
- [ ] Roll back using the retained healthy image and confirm routing is restored.
- [ ] Complete the custom-domain cutover checklist below.

### Stop Conditions

- Detection or approval does not match the current commit or configuration.
- The deployment becomes stuck, loses logs, fails health checks unexpectedly, or
  cannot be cancelled safely.
- The platform application URL is unhealthy or bypasses the managed route.
- A failed update displaces the healthy release.
- The custom-domain change would remove the existing HelloRun fallback before the
  managed release is proven.

### Required Evidence

- Current detection commit, approval snapshot version, and sanitized approval result.
- Deployment stages, logs, health, route, notification, update, failure, and rollback
  results.
- Platform and custom-domain HTTPS results without internal addresses.
- Recorded fallback and final cutover decisions.

### Completion Gate

HelloRun is built and operated by HelloDeploy, both public addresses are healthy, an
update and rollback pass, and the independent PM2 deployment is no longer required
for normal service.

## HelloRun Cutover Checklist

- [ ] Keep the existing PM2 HelloRun process and its current traffic path unchanged.
- [ ] Deploy `hellorun-e783` through HelloDeploy and verify the managed container
      directly through the platform application address.
- [ ] Observe the managed release long enough to confirm stable health, logs,
      resources, and notifications.
- [ ] Confirm the active nameservers for `hellorun.online`; edit DNS only at the
      authoritative provider.
- [ ] Publish the exact HelloDeploy TXT verification record without replacing
      unrelated DNS records.
- [ ] Run **Check DNS record**, wait for verified ownership, and obtain administrator
      domain approval.
- [ ] Add the custom hostname to Cloudflare Tunnel ingress and the managed Nginx route.
- [ ] Verify HTTPS, expected content, health, redirects, and application behavior at
      `hellorun.online`.
- [ ] Test the documented route back to the independent PM2 service.
- [ ] Observe the managed custom domain before removing the old route or process.
- [ ] Remove the independent service only after rollback ownership and monitoring are
      confirmed.

## P5 - Prove the Workflow for Other Projects

**Status:** Not Started

**Dependencies:** P4 Complete; a second noncritical supported repository; test users
for each role.

**Tracker mapping:** Batch 7 Pilot and Recovery Drills; Roadmap Phase 7.

### Actions

- [ ] Complete a new project lifecycle as an Owner: create, connect repository,
      check app, configure, submit purpose, receive approval, deploy, view logs, and
      open the app.
- [ ] Verify Manual and Automatic deployment modes, GitHub webhooks, build filters,
      selected commits, notifications, environment secrets, maintenance mode,
      custom domains, archive, and deletion.
- [ ] Keep the unsupported legacy `Approval Required` mode unavailable for new
      selections.
- [ ] Verify Owner, Maintainer, Viewer, Admin, and Super Admin reads and mutations,
      including rejection of unauthorized direct requests.
- [ ] Exercise duplicate submissions, stale detection, changed commits, requested
      changes, disconnected repositories, unavailable queues, failed deployments,
      retry, and recovery states.
- [ ] Complete authenticated desktop, 390px mobile, keyboard, screen-reader, focus,
      error-association, and long-content checks.
- [ ] Fix discovered defects narrowly and rerun the affected gate and full quality
      checks.

### Stop Conditions

- A normal project requires undocumented manual server work.
- Authorization, secret handling, accessibility, or recovery behavior fails.
- Automatic deployment can bypass approval or readiness requirements.
- A critical or high-severity defect remains unresolved.

### Required Evidence

- End-to-end lifecycle results for the second project.
- Role and direct-request authorization results.
- Webhook, automatic deployment, secrets, domain, maintenance, and notification
  results.
- Desktop, mobile, keyboard, and screen-reader evidence.

### Completion Gate

A second supported project reaches a healthy public release without manual server
deployment, and normal users can complete their permitted workflows safely.

## P6 - Recovery and Formal Production GO

**Status:** Not Started

**Dependencies:** P5 Complete; monitoring ownership; controlled maintenance window;
second clean restore host.

**Tracker mapping:** Recovery and Ubuntu 26 Graduation; Batches 7 and 8; Roadmap
Phases 7 and 8.

### Actions

- [ ] Configure actionable monitoring for web and worker readiness, queue depth,
      failed jobs, disk, memory, Docker capacity, certificates, and public ingress.
- [ ] Define log retention, alert thresholds, incident ownership, escalation, and
      response expectations.
- [ ] Drill MongoDB, Redis, Docker, worker, Nginx, Cloudflare Tunnel, low-disk, and
      high-memory interruptions.
- [ ] Perform one successful immutable platform upgrade.
- [ ] Perform one intentionally failed upgrade and restore the prior release,
      dependencies, units, ingress, routes, readiness, and queue state.
- [ ] Create a final encrypted off-host backup after normalization.
- [ ] Restore the backup on a second clean host and serve a representative deployed
      project.
- [ ] Record achieved recovery point and recovery time objectives.
- [ ] Promote Ubuntu 26.04 from candidate status only after its installation,
      deployment, rollback, interruption, and restore evidence passes.
- [ ] Reconcile the tracker, roadmap, live checklist, runbooks, and worklog.
- [ ] Tag the verified immutable release and record the formal GO or NO-GO decision.

### Stop Conditions

- Monitoring cannot detect a release-blocking dependency failure.
- Upgrade rollback or second-host restoration fails.
- Queue state, routing state, or active release identity is unknown after recovery.
- A critical or high-severity issue remains unresolved.

### Required Evidence

- Monitoring and alert-delivery results.
- Sanitized interruption, upgrade, rollback, backup, and second-host restore records.
- Recorded recovery objectives and actual results.
- Clean release commit, quality gates, acceptance reconciliation, and formal decision.

### Completion Gate

All release gates have direct evidence, recovery works on a second host, operational
ownership is defined, no unresolved critical or high-severity defect remains, and the
authoritative tracker records production **GO**.

## Decision Log

Record product or operational decisions that affect execution order, risk, or the
definition of success. Do not record credentials, private identifiers, internal
addresses, or secret values.

| Date       | Decision                                           | Reason                                                        | Owner         |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------- |
| 2026-07-31 | Use the current Ubuntu 26.04 laptop as target host | Continue the prepared in-place productionization path         | Project Owner |
| 2026-07-31 | Use HelloRun as the controlled production pilot    | Prove the real workflow before accepting other hosted apps    | Project Owner |
| 2026-07-31 | Retain the independent PM2 HelloRun fallback       | Preserve availability until managed URLs and rollback pass    | Operator      |
| 2026-07-31 | Require P0-P6 before customer-hosting GO           | UI readiness alone does not prove safe application deployment | Operator      |

## Execution Evidence

Add one row after each meaningful execution or verification step. Keep results
sanitized and link detailed evidence to the worklog or authoritative checklist.

| Date       | Priority | Commit or release                          | Command or check                          | Sanitized result                                                                        | Blocker or next action                                   | Evidence link                                    |
| ---------- | -------- | ------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| 2026-07-31 | P0       | `6d0bf82530d01bb941b6309c83a1a8bde18a4447` | Node.js 22 release gate                   | 839 tests and production audit passed                                                   | Capture host and backup evidence                         | [Worklog](../WORKLOG.md)                         |
| 2026-07-31 | P0       | `6d0bf82530d01bb941b6309c83a1a8bde18a4447` | Value-safe host and queue inventory       | Dashboard ready; no deployments queued; one valid DNS check waiting                     | Keep DNS job waiting until P2                            | [Live checklist](LIVE_WORKFLOW_ACCEPTANCE.md)    |
| 2026-07-31 | P0       | `6d0bf82530d01bb941b6309c83a1a8bde18a4447` | Fallback and backup prerequisite check    | HelloRun public fallback failed; backup inputs incomplete                               | Restore fallback, then authorize privileged backup gate  | [Batch tracker](IMPLEMENTATION_BATCH_TRACKER.md) |
| 2026-07-31 | P0       | `ef5534d59f393febf9f55eca4d49f4192865cecd` | Dashboard and dedicated tunnel restart    | Dashboard check passed; live tunnel still returned error 1033                           | Repair and validate the hostname DNS tunnel route        | [Live checklist](LIVE_WORKFLOW_ACCEPTANCE.md)    |
| 2026-07-31 | P0       | `ef5534d59f393febf9f55eca4d49f4192865cecd` | Correct-account HelloRun fallback route   | Authoritative DNS and repeated HTTPS 200 checks passed                                  | Complete backup and rollback prerequisites               | [Worklog](../WORKLOG.md)                         |
| 2026-07-31 | P0       | `2ed2f4ea390d32267820fee4d854b3aa2f7d11f6` | Encrypted capture and retrieval           | Database, artifact, recovery key, and rollback checks passed                            | Begin isolated P1 foundation preparation                 | [Batch tracker](IMPLEMENTATION_BATCH_TRACKER.md) |
| 2026-07-31 | P1       | `49eec517acbf5f4c0e309e4600f88d615fa81f5c` | Production Node.js guard                  | Local gate passed; host mutation not started                                            | Merge guard, then run inactive preparation               | [Worklog](../WORKLOG.md)                         |
| 2026-07-31 | P1       | `d8f0c0acb65bfead9dd753dcb5ee34b4d46c06a2` | Partial-install retry guard               | Local gate passed; inactive host foundation partially prepared                          | Merge guard, then complete inactive preparation          | [Worklog](../WORKLOG.md)                         |
| 2026-07-31 | P1       | `42daf64cb2ebe726a106022ddf07db814c63c215` | Candidate lifecycle test                  | Start/readiness passed; systemd stop timed out                                          | Merge shutdown repair and repeat real lifecycle test     | [Worklog](../WORKLOG.md)                         |
| 2026-07-31 | P1       | `704cb75a02d76a36a88d155a37052df4464bf1a2` | Corrected lifecycle retest                | Inactive verifier and clean real start/stop passed                                      | Begin paused P2 queue inventory and routing activation   | [Worklog](../WORKLOG.md)                         |
| 2026-08-01 | P2       | (local repair)                             | Live wildcard-ingress activation attempt  | Candidate validation rejected unquoted wildcard YAML; rollback restored both connectors | Quote generated hostname, retry live activation          | [Worklog](../WORKLOG.md)                         |
| 2026-08-02 | P2       | (local repair)                             | Live wildcard-ingress activation retry    | Candidate validation and restart passed; terminal success not reached before rollback   | Add bounded 60s convergence wait, retry live activation  | [Worklog](../WORKLOG.md)                         |
| 2026-08-05 | P2       | `e642d0769faca1d8fcb264fe0ee105c5aced4811` | Live wildcard-ingress activation retry    | Local wildcard ingress, connectors, and public fallbacks all passed                     | Add wildcard DNS; start candidate web/worker services    | [Worklog](../WORKLOG.md)                         |
| 2026-08-06 | P2       | `e314dd164266cfd172175b1c08e4b257dcbd1ef6` | Live candidate service activation attempt | Session-cookie check timed out; session-store write raced graceful shutdown             | Wait for pending writes before closing the database      | [Worklog](../WORKLOG.md)                         |
| 2026-08-06 | P2       | `dbb6fdd1d10fe33610f38a2cbb03c65be46878ac` | Live candidate service activation retry   | Web/worker started under intended identities; health, readiness, cookie all passed      | Add wildcard DNS; cut dashboard traffic to candidate web | [Worklog](../WORKLOG.md)                         |
| 2026-08-08 | P2       | `068e5c6acaa9761566e1a33921429175fbe8ade1` | Wildcard domain migration + deactivate    | Old wildcard rule removed, new `*.hellodeploy.online` rule activated, DNS added         | Retry candidate services; verify wildcard HTTPS           | [Worklog](../WORKLOG.md)                         |
| 2026-08-08 | P2       | `b0d0198123619624795c122e9a8e9d0e18eec098` | Candidate services retry + nginx-helper fix | Worker-ready passed after fixing a stale ReadWritePaths bind-mount; wildcard HTTPS confirmed publicly | Cut dashboard traffic to candidate web; resume queue      | [Worklog](../WORKLOG.md)                         |

## Required Verification

At each priority:

1. Run the relevant focused security, installer, Nginx, worker, deployment, approval,
   domain, authorization, UI, or recovery checks.
2. Run `npm run config:check` when configuration or environment behavior is involved.
3. Run `npm run lint`, `npm run format:check`, and `npm test`.
4. Review the final diff and worktree for unrelated changes.
5. Record direct live evidence in the acceptance checklist, status changes in the
   batch tracker, and detailed evidence in the worklog.

Mocks and local substitutes may validate implementation but cannot mark Docker,
Nginx, Cloudflare, authenticated workflow, supported-host, rollback, or restore gates
Passed.
