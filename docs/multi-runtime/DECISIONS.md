# Multi-Runtime Decisions

- 2026-10-16: P0-P1 is the first release. Python, PHP, Java, Dockerfile, arbitrary
  OCI, Compose, databases, volumes, and background workers are deferred.
- 2026-10-16: `runtimeType` remains framework classification. `buildStrategy` is a
  separate versioned contract; missing values mean exact legacy behavior.
- 2026-10-16: Application roots are repository-relative POSIX paths and are checked
  against the cloned commit with `realpath` before use.
- 2026-10-16: New jobs consume a stored snapshot and immutable digest. V1 queue jobs
  remain accepted during rollout.
- 2026-10-16: New Next.js modes are npm-only, Node 22 Debian slim for server modes,
  default-off, and available only through a project allowlist.
- 2026-10-16: Builds use a separately provisioned rootless BuildKit host and private
  GHCR. ORAS performs exact digest deletion with credentials from the protected
  worker store.
- 2026-10-16: P1 is single-instance; ISR and cache durability across replacement or
  rollback are not part of the promise.
- 2026-10-16: Live acceptance uses this public repository with one distinct application
  root per fixture. Protected hook URLs and canary values remain outside the checkout.
- 2026-10-16: The coordinator is preflight-only unless `--execute`, the exact
  nonproduction confirmation ID, and an absolute evidence directory are all supplied.
  Cancellation, timeout, worker interruption, resource pressure, and registry cleanup
  each require an additional independent flag.
