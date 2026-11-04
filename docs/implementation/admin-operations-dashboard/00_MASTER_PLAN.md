# HelloDeploy Admin Operations Dashboard — Master Plan

Version 1.0 | 2026-11-05 | Status: approved direction, implementation contingent on Phase 0 audit

## Mission

Transform `/admin` into a desktop-first, full-width, single-page operations overview that immediately answers: Is the platform healthy? Are apps reachable? What is consuming CPU/RAM/disk/network? Are deployments progressing? Is there capacity for another build? What needs attention?

This is an **overview**, not a replacement for Projects, Deployments, Users, Domains, Build Service, Audit, or Security pages. Provide drill-down links to existing interfaces.

## Approved decisions

- Preserve existing HelloDeploy design language, EJS/Express and admin route, theme, sidebar, existing RBAC.
- Maximize useful screen area on 1366, 1600, 1920 and 2560px desktops; fluid content without article-style max width; compact, readable panels.
- Hybrid live updates: server-side shared collectors and cache, targeted browser polling at safe intervals, existing/event-driven SSE for actionable incidents and deployments. No full-page reload.
- Default resource snapshot display ~15s, service checks ~30s, historical chart refresh ~60s, counts ~120s. All are proposed, subject to audit and performance validation.
- Administrators can configure personal view preferences and separately authorized global policies via proposed `/admin/overview/settings`, subject to routing audit.
- Show actual usage, configured container limits, host capacity, and capacity-policy headroom as distinct concepts.
- Deterministic health/alert rules, deduplication, acknowledgment separate from resolution, stale/unknown rather than misleading zeros.
- Lightweight and bounded: no mandatory Grafana/Prometheus/extra monitoring stack; reuse `@hellodeploy/observability` and existing mechanisms.
- Preserve web/worker/Docker/Nginx privilege separation; no Docker socket exposure to public web process.
- Phase 0 source-level audit is mandatory. Implementation follows phased gates, with deploy only when existing CI, backups, rollback and production checks pass.

## Existing evidence, not yet verified implementation details

Screenshot reviewed 2026-11-05 shows 2 users, 6 active projects, 15 running containers, 70% memory, 5 failed queue jobs, worker Ready, queue Active, release metadata needing verification. These are a snapshot, **not current production telemetry**.

Repository `4hprojects/HelloDeploy`, default branch `main`, docs reviewed 2026-11-05: `README.md`, `docs/PLATFORM_ARCHITECTURE.md`, `docs/PRIORITIES.md`, `docs/USER_GUIDE.md`, manifests. Documented stack: Node/Express/EJS, MongoDB, Redis/BullMQ, Docker, Nginx, Cloudflare Tunnel, split web/worker, live deployment SSE and project quotas. The exact admin route/controller/collector/storage implementation is **not yet audited**. Read live repository files before changing code.

## Delivery order

0. Audit and architecture reconciliation (no features)
1. Responsive full-width overview and personal settings foundation
2. Trusted collection, snapshot cache, host/container metrics
3. Workload, queue, services, builder and event integrations
4. Historical aggregates, alert lifecycle and configurable policies
5. Capacity, prioritized attention and verified operational evidence
6. Regression, security, overhead, rollout and rollback verification

## Hard boundaries

No Kubernetes, auto-scaling, multi-node orchestration, host shell from web, automatic quota changes, destructive dashboard shortcuts, unverified uptime, invented metrics, or enabling remote builder/pilot flags. Respect production priorities and documented operational gates. Any privileged boundary change requires explicit owner approval. No production deploy on failing gates.

## Definition of done

Desktop fits available width without clipping; all major values have timestamps/units/status; adverse events become actionable; personal/global settings remain distinct; collectors remain bounded and isolated; tests and production checks pass; measured overhead recorded; rollback documented; docs updated.

## Source of truth and precedence

Actual checked-out code and current repository docs outrank proposed filenames and endpoints in this package. Phase 0 reconciles differences and writes a decision log. This document expresses requirements, not a claim that routes or modules already exist.
