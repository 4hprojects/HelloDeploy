# Acceptance and Test Matrix

## UI and responsiveness

Capture screenshots 1366x768, 1600x900, 1920x1080, 2560x1440, 1024x768 and 390x844 (both themes). At widths >=1366, content fills >=95% of available main region without oversized max-width; check 100/125/150% zoom, keyboard navigation, contrast, no body horizontal overflow, no clipped titles, no excessive empty margins. At 1920x1080 expect 6 KPIs where feasible, status/alerts and a substantial trend visible without shrinking text below usable size. Preserve scroll position during updates.

## Correctness cases

- Docker container running while HTTP health fails => not Healthy.
- Intentionally stopped project => Stopped/Maintenance, not unexpected outage.
- Candidate and retained release => not extra active projects.
- Host MemAvailable and swap calculations handle cache accurately.
- Network counter reset => no negative traffic spike.
- Unknown or stale collector => Unavailable/Unknown, never zero or healthy.
- Historical failure resolved by successful redeploy => not necessarily active incident.
- Queue paused => Paused with context, not processing normally.
- Disabled remote builder => Disabled, not failure.
- Quotas configured but unused => allocations distinct from usage.
- Missing verified backup evidence => Unknown.

## Live transport

Multiple admins and tabs share collection; SSE reconnect/backoff, event sequence dedupe, permission recheck, session expiry, hidden tab, offline recovery, proxy heartbeat and fallback polling. Manual refresh may fetch cached latest; do not spawn arbitrary Docker scans.

## Settings/security

Role denied for non-admin endpoints; personal settings isolated per account; global changes audited; invalid thresholds, too-fast cadence and long retention rejected; no Docker socket or privileged host commands in web; no secret/token/private log leakage; CSRF and session controls respected.

## Performance and reliability

Measure baseline and with 1/3/10 dashboards: host CPU, RSS delta, collection duration, DB reads/writes/storage growth, API p95, queue latency and deployment throughput. Candidate targets idle CPU <2% sustained, additional memory <100MiB where practical. If not achieved, optimize or adjust sampling safely and record deviation. Simulate collector loss without deployment disruption.

## Release gates

Follow actual repo scripts and CI, including lint, format, tests, assets/security checks as available. Confirm current backup, healthy release, rollback commands; no unauthorized schema migration or pilot enablement. Run external public readiness and representative project deployment checks when credentials/access allow; mark blocked if unavailable. Document post-release watch and rollback triggers.
