# Administrator Settings and Persistence

## Proposed route

`/admin/overview/settings` (actual router conventions determined in audit). Prominent Settings action on overview. Use existing auth, CSRF and settings patterns.

## Personal per-admin preferences

Sidebar expanded/collapsed, density Compact/Comfortable/Spacious (default Compact), visible optional widgets, selected history range (default 1h), theme via existing mechanism, browser refresh 15s/30s/60s/120s/300s/Manual, table rows. User settings may not suppress critical platform health display or alter collection. Persist per admin and validate enums. Keep fallback defaults for old accounts.

## Global admin policy (requires privileged admin role and audit)

- Collection intervals bounded by system minimums/maximums; suggested CPU/RAM/network/container 15s, disk and service 30s.
- Alert thresholds/durations, recovery hysteresis, deduplication, acknowledgment policy, notification mute windows.
- Aggregation and historical retention with storage caps.
- Capacity reserves, monitoring data collection limits, health-check rates.
- Optional nonessential collectors, where safe to disable.

## Proposed defaults

Warning CPU >80% sustained 5 min; critical >95% sustained 5 min with saturation evidence. Memory warning >80%, critical >90% with pressure; disk 80%/90%; container memory 80%/95% of enforceable limit. These are starting points and must be configurable after real workload analysis. Do not treat one high CPU sample as incident.

## Form UX

Sections: Dashboard Preferences / Live Monitoring / Resource Monitoring / Alerts / Historical Data / Performance. Separate Personal vs Platform-wide labels and permissions. Explain collection vs display refresh. Show recommended default, description, safe range and consequences. Validate client and server; optimistic feedback only after server success. Save/Reset defaults, unsaved-change warning, concurrency-safe versioning if existing conventions permit. No env edits/restarts for routine settings.

## Safety and auditing

Audit global changes with actor/time/before-after sanitized diffs and authorization. Never expose secrets. Reject unsafe intervals, negative retention, warning >= critical, invalid hysteresis, impossible durations, and excessive storage growth. Critical checks remain enabled even when charts hidden. Maintenance windows mute notifications, not collection or incident recording. Settings schema/version and migration/backfill tested. If settings storage exists, extend it, not duplicate it.
