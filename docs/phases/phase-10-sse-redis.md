# Phase 10 — Multi-instance SSE state + Redis pub/sub

- **Status:** Done
- **Started:** 2026-07-04T05:44:00+08:00
- **Accomplished:** 2026-07-04T05:51:25+08:00
- **Commits:** (this commit)

## Goal

The last two IMPROVEMENTS.md items: SSE per-user/per-IP stream caps lived in per-process Maps (wrong under >1 replica), and the log stream polled Mongo every 1.5 s per viewer.

## Tasks (checklist)

- [x] **Stream caps → Redis** — new `apps/web/src/services/sse-limiter.js`: `acquireStreamSlot`/`releaseStreamSlot` on `INCR`/`DECR` with a 7-minute TTL (above the 6-minute max stream duration, so a crashed process can't leak slots past one window); a rejected acquire rolls back its own INCR; release deletes the key at zero. Falls back to per-process counting when Redis is absent/not-ready/erroring (webhook-dedup pattern — never await a command on a non-ready client).
- [x] **Log push → Redis pub/sub** — the worker's shared `logEvent` publishes `{type:'log', id, stage, level, message(redacted), timestamp}` to `deploy-logs:<deploymentId>` fire-and-forget, and `updateStatus` publishes `{type:'status', status}` on terminal transitions so viewers see completion instantly. The worker's existing BullMQ connection is shared via `apps/worker/src/queue/worker-redis.js`.
- [x] **SSE handler** — subscribes through `apps/web/src/services/deploy-log-stream.js` (one dedicated subscriber connection for the whole process, per-channel handler sets, unsubscribe on last viewer). With pub/sub active the DB poll drops from 1.5 s to a 10 s completeness sweep; without Redis it stays at 1.5 s as the sole source. A `sentEventIds` set dedupes the two delivery paths.
- [x] Tests: `tests/deployment/sse-limiter.test.js` (7 — limits, rollback-on-reject, release, key deletion, memory fallback ×3), `tests/worker/deploy-log-publish.test.js` (4 — channel/payload, redaction parity with the stored record, terminal status publish, not-ready skip), `live-progress-sse.test.js` updated for the new wiring.
- [x] IMPROVEMENTS.md's last two open items closed.

## Notes

- True multi-instance behavior (two web replicas sharing caps and both receiving pub/sub) still deserves a check in a real 2-replica deployment; everything here was validated on one instance against real Redis.
- The 429 path rolls back its own INCR, so rejected requests never consume capacity.
- The subscriber connection is created lazily on the first SSE request, so web processes that never stream logs never open it.

## Verification

Live (dev harness :3210, real local Redis):

1. ✅ `curl -N` on `/deployments/<id>/logs` for a BUILDING deployment: `sse:user:<id>` and `sse:ip:127.0.0.1` keys appeared in Redis with count 1 during the stream.
2. ✅ `redis-cli PUBLISH deploy-logs:<id> {type:'log',…}` → the event line appeared on the open stream immediately (no poll wait).
3. ✅ `PUBLISH {type:'status',status:'HEALTHY'}` → `event: status` emitted and the stream closed; all `sse:*` keys removed after close.
4. 🔍 Cap probe: 3 concurrent streams as one user, 4th request → **429** "Too many live log streams…" with the Redis count still 3 (rejected acquire rolled back).
5. `npm test` → **565/565** (+12); `npm run lint` clean.
