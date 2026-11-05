# Workloads, Deployments, Services and Build Service

## Applications summary/table

Count Healthy/Degraded/Unhealthy/Starting/Stopped/Maintenance/Unknown. For each active project show name, status, CPU, memory, configured limit, uptime, latest release, last health check and last deployment. Sort by severity and resource consumption; drill into existing project detail. Distinguish project from container (candidate/retained releases do not count as extra applications).

## Deployments

Show queue Waiting/Active/Delayed/Failed/Stalled/Paused with time scopes, current stage and elapsed for active builds, recent successes, historical failure counts and unresolved incidents separately. Reuse BullMQ and existing deployment logs SSE / failure explanations; don't implement a separate lifecycle. Do not expose raw private logs in admin overview. Link to existing queue and deployment management pages.

## Services

Check web readiness, worker heartbeat **and actual job progress**, Redis connectivity **and queue operation**, Mongo connectivity, Docker, Nginx routing health, Nginx helper, Cloudflare tunnel local health plus public reachability where configured. Express Unsupported/Disabled/Unknown separately. Service status must have evidence timestamp and meaningful failure reason.

## Build Service

Display enabled/disabled, local vs optional remote mode, idle/busy/unavailable, active builds, most recent result, idle shutdown and resource usage if accessible. No auto enablement or change to optional remote builder flags. Remote builder capacity distinct from app host capacity.

## Operational attention

Prioritize active actionable issues: host pressure, unhealthy apps, stuck queue, release verification mismatch, backup evidence overdue when available, pending account closure deadlines and admin reviews. Group recurring occurrences and link to real management controls. No destructive direct buttons. Summaries are deterministic, not AI-generated.

## Activity feed

Human-readable descriptions, source event ID retained in details, event time, actor when applicable, target, outcome, link. Filter deploy/service/admin. Include latest 10–20 on overview; audit history remains authoritative on existing page.
