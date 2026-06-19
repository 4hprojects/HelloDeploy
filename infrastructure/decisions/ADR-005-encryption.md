# ADR-005: Secret Encryption

**Status:** Accepted  
**Date:** 2026-06-19

## Context

User-provided environment variable values (API keys, database URIs, tokens) must be stored securely. A compromise of the MongoDB database must not expose plaintext secrets.

## Decision

Use **AES-256-GCM** authenticated encryption for all stored secret values.

- Master encryption key stored in environment variable (`ENCRYPTION_MASTER_KEY`) — **never in MongoDB or source control**
- Key versioning via `ENCRYPTION_KEY_VERSION` — supports key rotation without immediate re-encryption of all records
- Each encrypted value stores: `{ ciphertext, iv, authTag, keyVersion }` — the key version is a record-level attribute, not part of the ciphertext
- Encryption/decryption lives exclusively in `@hellodeploy/security` package

## Rationale

- AES-256-GCM provides authenticated encryption — detects tampering
- External key storage means a database dump contains no usable secrets
- Key versioning allows gradual rotation without downtime
- Standard Node.js `crypto` module — no additional dependencies

## Consequences

- The master key must be backed up separately from the database
- Key rotation requires re-encrypting all records using the old key version
- Secret values must never appear in: logs, audit events, API responses, error messages
- The `@hellodeploy/security` package must be the only code path that calls encrypt/decrypt
