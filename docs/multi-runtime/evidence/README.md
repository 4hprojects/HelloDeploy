# Acceptance Evidence Directory

This directory contains reviewed, sanitized evidence summaries only. Live harness
output is written to the operator-selected absolute path outside the repository. Copy
an output here only after checking that it contains no hook URLs, private hostnames,
tokens, canary values, connection strings, environment values, or raw logs.

Repository-local tests do not complete a live BuildKit, GHCR, route, rollback, or
supported-host gate.
