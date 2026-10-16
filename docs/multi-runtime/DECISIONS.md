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
- 2026-10-17: A nonproduction pilot database is identified by a structured marker
  keyed to `HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID`, which must equal the acceptance
  `confirmationId`. Alternative rejected: relying on `NGINX_ENABLED`, which does not
  identify an environment.
- 2026-10-17: Versioned Next.js server images set `HOSTNAME=0.0.0.0`, and every
  versioned Next.js build sets `NEXT_TELEMETRY_DISABLED=1`. Legacy templates are
  unchanged so existing deployments keep byte-identical images.
- 2026-10-17: Configurations that are known to fail after the build (no start script or
  a development-only `next` in standard mode, a custom `distDir`) are detection
  warnings, not errors. The owner can still choose a different mode, and an error would
  block legacy projects whose image never runs `npm start`.
- 2026-10-17: P2 Python is in the first release scope, still default-off and allowlisted
  (`MULTIRUNTIME_PYTHON_V1_*`). This supersedes the 2026-10-16 deferral of Python.
- 2026-10-17: Python uses `runtimeType: PYTHON` with one versioned strategy per framework
  (`python_flask_v1`, `python_fastapi_v1`, `python_django_v1`), mirroring `NEXTJS` and its
  `next_*` modes. Alternative rejected: one runtime type per framework, which would scatter
  language-level checks.
- 2026-10-17: The entry point is a validated `applicationModule` (`module:attribute`), not a
  free-form start command, so nothing owner-typed reaches `CMD`. App factories need a
  module-level object; `create_app()` call syntax is rejected.
- 2026-10-17: Dependencies install only from `requirements.txt`. `pyproject.toml` is read
  to recognize the framework, and pyproject-only projects get an export command. The
  server package (gunicorn or uvicorn) must be listed; HelloDeploy never adds unpinned
  packages.
- 2026-10-17: The Python version comes from `.python-version` in the cloned commit, limited
  to 3.12 and 3.13 (default 3.13) on `python:<v>-slim-bookworm`. No compiler is installed;
  packages must ship wheels.
- 2026-10-17: Node detection runs first, so existing Node projects detect unchanged. Python
  wins over a root `index.html` (which would otherwise publish `.py` source as static
  files) and over a `package.json` that names no Node runtime.
- 2026-10-17: Django migrations and collectstatic are never run implicitly. collectstatic
  is an optional owner build command; migrations stay an owner action against the external
  database.
- 2026-10-17: Strategy enablement is one shared rule in contracts
  (`isPilotStrategyEnabledFor`), so web and worker cannot disagree.
