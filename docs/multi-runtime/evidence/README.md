# Acceptance Evidence Directory

This directory contains reviewed, sanitized evidence summaries only. Live harness
output is written to the operator-selected absolute path outside the repository. Copy
an output here only after checking that it contains no hook URLs, private hostnames,
tokens, canary values, connection strings, environment values, or raw logs.

Repository-local tests do not complete a live BuildKit, GHCR, route, rollback, or
supported-host gate.

Point-in-time records kept here:

- [2026-10-16-baseline-audit.md](2026-10-16-baseline-audit.md) — the repository's state before
  multi-runtime work began.
- [2026-10-16-acceptance-harness-local.md](2026-10-16-acceptance-harness-local.md) — local
  results for the acceptance harness.
