# Production Rollout, Operations and Recovery

## Before deploy

Check `docs/PRIORITIES.md`, production architecture and `docs/OPERATIONS_RUNBOOKS.md` at implementation time. Confirm exact clean commit, CI pass, approved migrations/indexes, backup evidence, retained healthy rollback release, worker/queue baseline, existing application health and safe feature flags. Preserve main branch autodeploy procedures. No manual shortcut around release gates.

## Staging and canary

Review with sample/limited data, then controlled production rollout behind existing feature flag only if repository conventions support it. Start with UI and cached metrics, measure overhead; enable history/alerts after correctness verified. Do not install Prometheus/Grafana or expose sensitive metrics endpoints publicly by default. Do not enable remote builder or other pilots.

## Post-release monitoring

Watch web and worker RSS/CPU, MongoDB query count and storage, Redis load, queue latency, deployment success, collector errors, public ingress/HTTP behavior and affected hosted applications. Record timestamps and baseline comparisons.

## Rollback triggers

Regressed deploys, elevated worker queue latency, host memory/disk pressure from collector, user-facing response degradation, secret exposure, incorrect critical health, unauthorized access, unbounded metrics storage, failing migrations. If trigger met use established immutable release rollback and migration recovery plan. Never delete monitoring records or change security policies as ad hoc workaround.

## Runbook for admin

Manual refresh updates cached snapshots. Red/amber incidents link to actionable details; Unknown means telemetry lacking. Settings separate browser display from collector schedules. During planned maintenance use notification mute, not disabling checks. Retention changes may delete only monitoring aggregates under documented policy, not audit logs.

## Handover

Update feature documentation, settings defaults/ranges, data contracts, maintenance procedures, failure recovery, indexes, retention jobs, screenshots, performance evidence and final operator checklist.
