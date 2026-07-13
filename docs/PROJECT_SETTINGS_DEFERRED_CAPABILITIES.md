# Project Settings Deferred Capability Evaluations

Updated: 2026-07-13

## Purpose and Decision Boundary

This document evaluates capabilities observed during the Project Settings UX review that HelloDeploy does not currently support. It is a product and engineering decision aid, not an implementation plan or promise.

Every capability below remains **Deferred**. Before implementation, its owner must document the concrete user need, select an architecture, add an accepted architecture decision record (ADR), update the relevant scope, workflow, data-model, security, operations, and test documentation, and obtain explicit product approval. No deferred capability should appear as a disabled or “coming soon” control in the application before that approval.

## Evaluation Summary

| Capability                      | Disposition                     | Primary reason                                               | Earliest prerequisite                           |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Pull-request previews           | Deferred                        | Introduces a separate ephemeral deployment lifecycle         | Stable real-deployment and cleanup evidence     |
| Edge caching                    | Deferred                        | No cache or invalidation control plane exists                | Measured performance need and routing design    |
| Region selection                | Not applicable to current scope | HelloDeploy targets one self-hosted platform                 | Approved multi-region platform architecture     |
| User-selectable instance sizing | Deferred                        | Resource limits are administrator-owned quotas               | Capacity measurements and scheduling policy     |
| Interactive shell access        | High-risk deferred              | Remote command execution materially expands trust boundaries | Dedicated container-isolation security review   |
| Horizontal or manual scaling    | Deferred                        | The release model assumes one active application container   | Replica-aware routing and orchestration design  |
| Persistent disks                | Deferred                        | Storage lifecycle, placement, and recovery are not modeled   | Storage provider and backup/restore design      |
| One-off jobs                    | Deferred                        | Requires a new execution lifecycle and permission model      | Stable worker capacity and execution contract   |
| Custom maintenance-page URL     | Deferred                        | External content adds routing and failure ambiguity          | Validated product need and safe fallback policy |
| Advanced networking controls    | Not applicable to current scope | No service-mesh or tenant-network abstraction exists         | Approved multi-service networking model         |

The order above is not a delivery priority. Capacity and production-readiness gates remain authoritative over feature expansion.

## Pull-Request Previews

**User need.** Let a team test a proposed repository change at an isolated temporary URL before merging it.

**Architecture and data.** Model a preview independently from the production project release, bind it to repository and commit identifiers, allocate an isolated hostname and resources, handle GitHub open/update/close events idempotently, and expire abandoned previews. Preview secrets and domain behavior need an explicit inheritance policy.

**Security.** Prevent untrusted pull-request code from receiving production secrets or privileged network access. Define fork behavior, actor authorization, webhook replay protection, isolation, quotas, and abuse controls.

**Operations.** Provide cleanup reconciliation, per-preview logs and status, concurrency limits, disk reclamation, routing rollback, and cost/capacity alerts.

**Acceptance evidence before launch.** Demonstrate create, update, supersede, close, expiry, cleanup retry, fork denial, secret isolation, quota enforcement, and route removal on a supported host.

**Approval gate.** Requires a preview-lifecycle ADR and explicit decisions for forks, secret inheritance, retention, quotas, and hostname policy.

## Edge Caching Controls

**User need.** Reduce latency and application load for cache-safe responses or static assets.

**Architecture and data.** Select the cache location and ownership boundary, define cache keys, allowed response classes, invalidation, purge propagation, deployment interaction, and safe defaults. A setting cannot be added until an actual cache layer exists.

**Security.** Prevent caching authenticated, personalized, secret-bearing, error, or `no-store` responses. Account for host-header separation, cookies, authorization headers, poisoning, and cross-project leakage.

**Operations.** Expose sanitized hit/miss and purge health, bound storage, recover from stale or unavailable caches, and document emergency bypass and purge procedures.

**Acceptance evidence before launch.** Verify cache eligibility, project isolation, deploy invalidation, explicit bypass, authenticated-response exclusion, poisoning resistance, observability, and rollback under failure.

**Approval gate.** Requires a caching ADR, performance evidence, and an approved cache-safety policy.

## Region Selection

**User need.** Place workloads near users or within a required jurisdiction.

**Architecture and data.** Current HelloDeploy installations represent one self-hosted deployment target, so a region selector would misrepresent capability. Multi-region support would require platform/cluster identities, placement, image distribution, routing, health, failover, and data-location models.

**Security.** Define credential distribution, inter-region trust, tenant isolation, key management, residency, and control-plane authorization.

**Operations.** Operate region inventory, capacity, evacuation, degraded-region behavior, latency monitoring, upgrades, and disaster recovery.

**Acceptance evidence before launch.** Prove placement, routing, failover, rollback, key isolation, capacity rejection, and recovery across real supported regions.

**Approval gate.** Not eligible for settings design until HelloDeploy approves a multi-region product and control-plane architecture.

## User-Selectable Instance Sizing

**User need.** Choose CPU and memory appropriate to an application workload.

**Architecture and data.** Existing quotas are administrator-managed safety limits, not schedulable instance products. A sizing feature needs named resource profiles, enforcement at container runtime, capacity admission, upgrade/downgrade behavior, and a relationship to owner quotas.

**Security.** Enforce hard limits server-side; never trust submitted profile identifiers or allow a project owner to exceed platform policy. Define denial-of-service protections and privileged-runtime restrictions.

**Operations.** Measure host headroom, reject unschedulable choices, surface out-of-memory and CPU-throttling signals safely, and define profile changes during deployments and rollbacks.

**Acceptance evidence before launch.** Verify enforced CPU/memory limits, quota conflicts, insufficient-capacity rejection, profile changes, rollback, audit events, and representative load behavior.

**Approval gate.** Requires measured host capacity, a scheduling/resource-profile ADR, and a product decision on whether owners may choose profiles.

## Interactive Shell Access

**User need.** Diagnose a running release or perform a narrowly scoped administrative action.

**Architecture and data.** Shell access is remote command execution and cannot reuse the ordinary settings-form model. It requires a brokered, short-lived session tied to a specific release, transport and terminal protocols, concurrency and duration limits, and deterministic teardown.

**Security.** Treat this as high risk. Require strong reauthentication, least-privilege roles, container isolation, command/session auditing policy, CSRF and origin protection, rate limits, terminal escape handling, and explicit prevention of host, Docker-socket, route-helper, and other-project access. Recording policy must avoid collecting secrets inadvertently.

**Operations.** Bound sessions and output, handle disconnects, revoke access immediately, monitor broker health, and provide incident response for suspected shell abuse.

**Acceptance evidence before launch.** Complete a dedicated threat model and penetration review; prove authorization, expiry, revocation, isolation, audit metadata, output limits, disconnect cleanup, and denial of host-level access.

**Approval gate.** Requires a security-approved shell-access ADR and explicit product approval. It must not be bundled into the settings redesign.

## Horizontal or Manual Scaling

**User need.** Run multiple replicas for throughput or availability.

**Architecture and data.** The current pipeline activates one application container per release. Scaling requires desired/observed replica state, unique allocation, replica-aware health and routing, rolling replacement, deployment rollback semantics, and stateless-session guidance.

**Security.** Enforce quotas and network isolation across every replica, prevent stale replicas from remaining routed, and keep runtime secrets consistent without exposing them through control-plane state.

**Operations.** Reconcile failed or missing replicas, drain traffic, monitor per-replica health, manage host capacity, and define scaling during deployments and failures.

**Acceptance evidence before launch.** Demonstrate scale up/down, partial-start failure, traffic distribution, health removal, rolling deploy, rollback, quota rejection, reconciliation, and cleanup on a supported host.

**Approval gate.** Requires an orchestration ADR and explicit decisions on availability targets, session affinity, autoscaling, and quota semantics.

## Persistent Disks

**User need.** Preserve application files across deployments and container replacement.

**Architecture and data.** Define storage classes, allocation, mount paths, ownership, attachment rules, release interaction, resize/delete lifecycle, and whether volumes can move between hosts. Persistent disks must not be confused with managed database support.

**Security.** Validate mount paths, prevent host-path and cross-project access, isolate ownership, encrypt sensitive data where required, and authorize attachment, resize, restore, and deletion separately.

**Operations.** Implement capacity alerts, filesystem health, backup, restore, orphan reconciliation, migration, and safe deletion. State recovery objectives and test them.

**Acceptance evidence before launch.** Verify persistence through deploy/rollback/restart, attachment isolation, path safety, full-disk behavior, backup/restore, orphan cleanup, and irreversible-delete confirmation.

**Approval gate.** Requires a storage ADR, selected storage provider, and approved backup, restore, retention, and scheduling policies.

## One-Off Jobs

**User need.** Run migrations, maintenance commands, or finite administrative tasks using a project release.

**Architecture and data.** Add a job execution entity and state machine distinct from deployments and BullMQ infrastructure jobs. Define release/image selection, command and environment handling, timeout, cancellation, retry, log retention, and cleanup.

**Security.** Restrict who may execute commands, validate bounds, protect secrets, isolate the runtime, prevent host access, rate-limit submissions, and audit actor, project, release, and outcome without logging command-derived secrets.

**Operations.** Enforce concurrency and resource limits, retain bounded logs, reconcile abandoned jobs, support cancellation, and make failure visible without blocking deployment workers indefinitely.

**Acceptance evidence before launch.** Verify success/failure/timeout/cancel paths, authorization, concurrency and resource enforcement, secret redaction, log bounds, worker restart recovery, and container cleanup.

**Approval gate.** Requires a job-lifecycle ADR plus explicit command, retry, retention, quota, and permission policies.

## Custom Maintenance-Page URL

**User need.** Present branded maintenance content while public application access is disabled.

**Architecture and data.** Current maintenance behavior is controlled and supports a message. An external URL introduces redirect-versus-proxy semantics, URL validation, dependency failures, loops, caching, and TLS questions. Prefer extending safe built-in branding before external routing unless research establishes the need.

**Security.** Prevent open redirects, internal-network access, credential forwarding, unsafe schemes, host confusion, and stored phishing destinations. Administrative previews must not fetch arbitrary server-side URLs.

**Operations.** Define fallback to the built-in page, monitoring, rollback, validation expiry, and behavior when the external origin or DNS is unavailable.

**Acceptance evidence before launch.** Verify allowlisted schemes, public-target validation, loop prevention, safe failure fallback, audit events, unavailable-origin behavior, and removal during project deletion.

**Approval gate.** Requires a routing/security decision and evidence that built-in message/branding options do not satisfy the user need.

## Advanced Networking Controls

**User need.** Connect services privately or customize public/private ingress behavior.

**Architecture and data.** HelloDeploy has no tenant network or service-mesh abstraction. Supporting this requires service identities, private naming, network policy, ingress/egress semantics, discovery, and lifecycle reconciliation. Reference-product controls cannot be copied meaningfully into a single-host settings page.

**Security.** Default-deny boundaries, cross-project authorization, DNS trust, egress policy, metadata-service protection, and privileged network administration require a dedicated threat model.

**Operations.** Provide policy diagnostics, connectivity observability, safe reconciliation, upgrade compatibility, incident procedures, and recovery from partial network changes.

**Acceptance evidence before launch.** Prove isolation, authorized connectivity, denied paths, DNS behavior, policy rollback, reconciliation, observability, and cleanup across representative projects on supported infrastructure.

**Approval gate.** Not eligible for UI work until a multi-service networking model and security architecture are approved.

## Phase 4 Exit State

This evaluation closes the initial settings-redesign analysis only. It does not approve any feature for implementation. The Project Settings page remains limited to current authoritative HelloDeploy capabilities, and the next step for any row is a product decision selecting one capability for deeper discovery and ADR work.
