# Phase 10 — Multi-instance SSE state + Redis pub/sub

- **Status:** Pending
- **Started:** —
- **Accomplished:** —
- **Commits:** —

## Goal

The last two IMPROVEMENTS.md items: SSE per-user/per-IP stream caps live in per-process Maps (wrong under >1 replica), and the log stream polls Mongo every 1.5 s per viewer. Move caps to Redis and push log events over Redis pub/sub, keeping in-memory/polling fallbacks when Redis is unavailable.

## Tasks (checklist)

- [ ] Stream caps on Redis INCR/DECR with TTL above the max stream duration; not-ready → in-memory fallback (webhook-dedup pattern)
- [ ] Worker `logEvent` publishes each event to `deploy-logs:<deploymentId>` fire-and-forget
- [ ] SSE handler subscribes on a dedicated subscriber connection; DB poll drops to a slow catch-up sweep and keeps terminal-status detection
- [ ] Tests: cap helpers (Redis-stubbed + fallback), logEvent publish
- [ ] Live verification: `curl -N` the SSE endpoint while inserting events
- [ ] IMPROVEMENTS.md checkboxes updated

## Notes

## Verification
