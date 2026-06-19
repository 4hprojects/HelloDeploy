# ADR-002: Platform Database

**Status:** Accepted  
**Date:** 2026-06-19

## Context

HelloDeploy needs a durable store for user accounts, projects, deployments, audit events, and configuration. The platform must not require self-hosted database management on the same VPS — that adds operational risk to an already complex single-server deployment.

## Decision

Use **MongoDB Atlas** (free tier) as the platform database, accessed via **Mongoose**.

- Redis is operational state only (BullMQ queues, locks, rate-limit counters) — never durable source of truth
- User-deployed applications use external databases (MongoDB Atlas or Supabase) — never the platform database

## Rationale

- MongoDB Atlas managed service eliminates backup, patching, and replication concerns
- Flexible document model suits the evolving schema of deployment records and configuration
- Mongoose provides schema validation, middleware hooks, and index management
- Free tier sufficient for pilot-scale workloads

## Consequences

- All durable state must survive Redis restarts (Redis is treated as a cache/queue, not a DB)
- Schema migrations must be handled explicitly (no automatic DDL)
- Indexes defined alongside model schemas; migration runner validates them on startup
- **Encryption keys must not be stored in MongoDB** — they live in environment variables or a secrets file outside the database
