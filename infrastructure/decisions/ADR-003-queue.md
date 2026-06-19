# ADR-003: Job Queue

**Status:** Accepted  
**Date:** 2026-06-19

## Context

The web process must never execute Docker commands, Git operations, or Nginx changes directly. All infrastructure mutations must be delegated to the worker process. A reliable, inspectable job queue is needed.

## Decision

Use **BullMQ** backed by **Redis** (local, single-instance) for the job queue.

- The web process enqueues jobs only (producer)
- The worker process processes jobs only (consumer) — it has exclusive Docker socket access
- Concurrency is initially limited to **1 concurrent build** to prevent resource exhaustion on the single VPS

## Rationale

- BullMQ is mature, well-maintained, and purpose-built for Node.js
- Redis provides fast, reliable queue storage with BullMQ's job lifecycle support (retries, delays, events)
- Single-instance Redis is sufficient for the self-hosted pilot target; HA Redis can be added post-V1
- Built-in retry, backoff, and job event APIs avoid custom retry logic

## Consequences

- Redis must be running for any deployment to proceed
- Jobs must be idempotent — the worker may retry a job after a partial failure
- All job payloads are versioned; workers handle current and previous payload versions
- Build queue serialization (concurrency=1) means deployments queue behind each other — acceptable for pilot scale
