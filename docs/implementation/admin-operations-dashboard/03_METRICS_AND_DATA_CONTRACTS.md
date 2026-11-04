# Metrics, Attribution and Data Contracts

## Required metric envelope

Every value carries `key`, `value` (number or null), `unit`, `scope` (`host`, `platform`, `project`, `container`, `builder`), `source`, `collectedAt`, `freshness` (`fresh`, `stale`, `unavailable`), and optional `reason`. Include server snapshot timestamp/version. `null` is not zero. Never fabricate a reading or replace missing data with 0.

## Host

CPU: normalized utilization (0–100% host), cores, load average, optional CPU saturation. Memory: total, used, Linux MemAvailable, swap used/total, pressure when measurable. Disk: named filesystem capacity/used/available, inode pressure if feasible, separate Docker images/cache/logs. Network: bytes RX/TX converted from counter deltas with correct seconds and Mbps/MB/s units; account for counter reset and interface changes.

## Container

Collect actual CPU, memory (document usage vs cache accounting), network and block I/O where safe; map only recognized managed active-release containers using trustworthy existing ownership metadata. Separate platform, build, candidate, retained-release and unmanaged containers. Do not double count a service as both active project and retained release. Record restart count, container state, health and last check. Never expose raw Docker metadata or secrets.

## Allocation and capacity

Expose host physical capacity, actual usage, configured enforceable quotas, policy reserve/headroom, aggregate configured limits, overcommit indication. If Docker limits are unset say `Unlimited / not configured`. Do not infer number of deployable apps from arbitrary memory division. Remote build resources never count as local host resources.

## Applications

Statuses: Healthy, Degraded, Unhealthy, Starting, Restarting, Stopped, Maintenance, Unknown. Separate local health probe, container running state and public reachability; record last success/failure and sample time. Respect intentionally stopped and archived projects.

## Deployments

Queue waiting/active/completed/failed/delayed/stalled/paused counts, each with explicit window. Separate unresolved failure incidents from historical failed job counts. Success rate uses documented denominator and excludes/labels cancellations and intentional skips according to existing lifecycle. Stage names must follow actual repository state machine.

## Services and operational

Web, worker, Redis/BullMQ, MongoDB, Docker, Nginx, helper, tunnel, builder, release metadata, backups when authoritative. Reachability, readiness and actual work processing are different signals. Unknown when evidence absent.

## Example illustrative JSON (contract shape, not fixed API)

```json
{
  "snapshotAt": "2026-11-05T00:00:00.000Z",
  "metrics": [
    {
      "key": "host.memory.available",
      "scope": "host",
      "value": 2400,
      "unit": "MiB",
      "source": "trusted-host-collector",
      "collectedAt": "2026-11-05T00:00:00.000Z",
      "freshness": "fresh"
    }
  ],
  "status": "degraded",
  "warnings": []
}
```

## Required accuracy tests

Validate counter deltas, time interval, restarts, missing values, host memory accounting, CPU normalization, Docker cgroup limits, multi-container attribution, old releases, zero activity versus null. Timestamp and unit tests are mandatory.
