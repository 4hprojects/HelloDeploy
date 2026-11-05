# Live Monitoring Architecture

## Chosen approach

Hybrid: shared server-side collectors and snapshots, cached periodic browser requests, and SSE for deployment transitions, actionable incidents and appropriate admin events. Do not reload whole page. Avoid WebSockets unless audit demonstrates a real need. No mandatory Prometheus/Grafana installation.

## Default cadence (configurable after measured baseline)

| Data                                     |                        Default | Transport                                |
| ---------------------------------------- | -----------------------------: | ---------------------------------------- |
| Deployment/incident transitions          | immediately after source event | SSE                                      |
| Host CPU/RAM/network, managed containers |                            15s | shared collection + cached HTTP          |
| Disk, app/service checks                 |                            30s | scheduled collection + cached HTTP       |
| Queue summary                            |                            15s | event-driven invalidation or cached HTTP |
| Historical chart                         |                            60s | aggregate API                            |
| Users/projects/admin counts              |                           120s | cached HTTP                              |

The collector schedules are independent of visible browsers. If no admin is online, minimal health checks and alert evaluation still run. Browser refresh frequency must never be able to disable safety-critical checks.

## Trust boundary

Current platform has unprivileged `apps/web` and a separate worker authorized to access Docker; **never add Docker socket, sudo, arbitrary shell, or host command capability to web**. Consider worker-fed sanitized snapshots or narrowly scoped collector based on audit. Redis may hold latest snapshots when suitable; MongoDB may store aggregated time series after index/retention review. Do not grant extra privileges merely to collect metrics.

## Cache and fanout

One bounded collection cycle per source, with circuit-breaker/timeouts and fixed concurrency. Multiple admins read same sanitized snapshot. Consider TTL and collector-lock/lease to prevent duplicate schedulers. SSE events should be authorization-scoped, compact, contain sequence IDs, use heartbeats and reconnect/backoff. Avoid SSE connection proliferation across browser tabs; close on navigation, and verify ingress/proxy buffering and HTTP transport behavior.

## Browser states

Visible: requested polling with dynamic intervals; hidden: suspend heavy chart rendering and unnecessary polling; visible again: re-fetch snapshot. Offline: disconnected/stale badge; reconnection: deduplicate events and fetch latest snapshot. Manual refresh requests latest snapshot; it must not necessarily invoke a full privileged Docker scan per click. Offer SSE fallback polling and limit reconnect attempts.

## Error isolation

Never let metrics collection failure block the deployment queue or web readiness. Degrade monitoring features independently. Cache last known data with stale timestamp and reason, not false green/zero. Bound historical queries, SSE clients, payload sizes and event filtering.

## Performance targets (must measure)

Target incremental idle monitoring CPU <2% sustained and additional memory <100 MiB where practical, with accuracy/availability taking precedence. Record real baseline and p95 request latency, CPU, RSS, collector duration, DB read/write rates, size growth and 1/3/10 admin session loads. Adjust cadence based on results rather than claim targets met.
