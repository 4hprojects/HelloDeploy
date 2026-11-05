# Alerts, History and Capacity Policy

## Incident model

Fields: stable dedupe fingerprint (scope + rule + resource), severity Critical/Warning/Info, firstSeen, lastSeen, occurrences, current state Active/Acknowledged/Resolved, triggering measurement/source, threshold/version, resolution timestamp, affected entity/link. Acknowledge is not resolve. Avoid notification flood. Alert on meaningful user-facing symptoms and actionable capacity trends, not every transient spike.

## Alert policies

Threshold + sustained duration + clear/recovery threshold (hysteresis). Defaults proposed, owner-configurable within caps. Missing monitoring becomes Unknown/collector incident; do not mark monitored system healthy by default. Separate actively failing deployment from five historic failed jobs. Maintenance mutes notifications only, not recording.

## History

Selectors 15m/1h/6h/24h/7d/30d; default 1h. Candidate retention: raw samples <=1h (at actual sampling resolution), 1-minute aggregates 24h, 5-minute aggregates 7d, hourly 30d, daily 90d. Actual index/TTL/cleanup approach determined in audit. Aggregate and downsample; avoid one MongoDB write per metric per client refresh. Include timestamps, gaps and provenance; never invent samples to fill gaps. Keep audit-log retention separate.

## Capacity

Host physical capacity, Linux available memory, actual container and platform consumption, sum of enforced limits, policy reserve, disk headroom, transient build workspace requirements. Warn on policy breach and overcommit but do not automatically resize quotas or block deployments unless existing admission controls explicitly authorize it. Do not promise a number of additional deployable apps without workload evidence.

## Backup and release evidence

Present last verified backup/off-host copy/restore rehearsal only when authoritative sources exist. File existence ≠ verified recovery. Release identity uses exact current/expected SHA from trusted existing metadata, with diagnostics drill-down. Missing authoritative data = Unknown, not Success.
