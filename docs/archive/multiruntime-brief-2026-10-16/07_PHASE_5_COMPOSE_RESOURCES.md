# Phase 5: Restricted Compose, Resource Management, and Future Scaling

## Entry gate

Only start after Phase 4 safe-builder/runtime controls, multi-service lifecycle design and realistic free-disk/RAM headroom are proven. Full arbitrary Docker Compose stays unsupported.

## Restricted Compose MVP

- Parse Compose to a normalized, allowlisted service graph. Never pass arbitrary user input directly to `docker compose up` on host.
- Proposed policy: max 3 services (configurable), one public HTTP service initially, private service-to-service network, server-owned labels/names, no user host port mapping.
- Disallow: `privileged`, `network_mode: host`, `pid: host`, `ipc: host`, `devices`, `cap_add`, bind mounts, Docker socket, host paths, unsafe sysctls, `build` from unauthorized sources, deployment-specific escape extensions and unbounded resource requests.
- Managed project-scoped named volumes only if backups, restore, eviction and deletion contracts exist.
- Health-check each required service. Track dependency readiness, rolling replacement, partial failure, cleanup and rollback across a release _set_.
- Distinguish stateless rollback from data/schema rollback; never promise automated rollback of persistent database state.
- Log by service, meter by service and enforce aggregate project quotas.

## Quotas and billing foundations

- Persist plan entitlements separately from actual host capacity and deployment resource allocations.
- CPU, memory, process count, disk, build concurrency/time, image size, log retention, bandwidth and volume quotas must have enforceable server-side limits.
- Offer Starter (0.25 CPU/256MB), Basic (0.5 CPU/512MB), Standard (1 CPU/1GB) as provisional presets; benchmark before publication.
- Reserve platform and build headroom on 8GB machine; do not enable Standard or multi-service broadly until measurement supports them.
- Meter actual usage but never claim CPU reservations or uptime guarantees without supporting infrastructure.
- Show estimated required resources before deploy, with reason and suggestions if insufficient.

## Multi-node (future ADR only)

Defer remote agents and capacity scheduling; separate design for mutual authentication, scheduling, secrets, cross-node ingress, rollback and recovery. Never add it opportunistically as a Compose subtask.

## Acceptance

Policy-bypass attempts rejected, service graph deploys and rolls back predictably, private services never exposed externally, project limits remain enforced after worker restart, and persistent volume handling documented/tested.
