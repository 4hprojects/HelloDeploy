# Sources, Evidence and Open Assumptions

## Repository evidence checked 2026-11-05

- https://github.com/4hprojects/HelloDeploy/blob/main/README.md — self-hosted platform, SSE logs, quotas, audit.
- https://github.com/4hprojects/HelloDeploy/blob/main/docs/PLATFORM_ARCHITECTURE.md — single-host topology; unprivileged web, separate worker, Docker and Nginx.
- https://github.com/4hprojects/HelloDeploy/blob/main/docs/PRIORITIES.md — current production priorities and deployment constraints (last documented update 2026-11-03).
- https://github.com/4hprojects/HelloDeploy/blob/main/docs/USER_GUIDE.md — project health, roles, deployment and settings behavior.
- https://github.com/4hprojects/HelloDeploy/blob/main/docs/OPERATIONS_RUNBOOKS.md — backup, verification and recovery procedures.
- https://github.com/4hprojects/HelloDeploy/blob/main/package.json — Node engine requirement >=22 in reviewed manifest, script/test commands.

## Public technical references checked 2026-11-05

- https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/ — informative dashboards, drill downs, refresh only when useful.
- https://prometheus.io/docs/practices/alerting/ — actionable alerts, symptom-first and slack for blips.
- https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events — one-way SSE, reconnection, connection limitations.
- https://docs.docker.com/reference/cli/docker/container/stats/ — Docker runtime stats concepts.

## Distinguish research from implementation

These references guide the design. They are not evidence that HelloDeploy exposes any particular endpoint, collector, or data structure. Audit current source, release SHA and production state before coding. Screenshot values are past observations, not live readings.

## Assumptions requiring validation

SSE reuse for admin event stream; exact route for overview settings; storage/index choices; local telemetry privileges; safe 15s collection on host; availability of reliable public reachability and backup status; feature flags; admin permissions and schema; actual source of memory percentage. If assumptions fail, use the simplest secure equivalent and document it.
