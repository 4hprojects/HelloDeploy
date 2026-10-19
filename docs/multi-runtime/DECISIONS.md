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
- 2026-10-17: Detection precedence: the Node analyzer runs first and its server results
  (Next.js, Express, Node start scripts) always win. When Node finds only a static site,
  a React/Vue build, or nothing, a recognized backend framework (Laravel, plain PHP,
  Django, Flask, FastAPI) takes the repository, because the frontend is that backend's
  asset pipeline and a static deploy would publish its source.
- 2026-10-17: PHP runs on the official `php:<v>-apache-bookworm` image with mod_php, as
  `www-data` on port 8080. Alternatives rejected: nginx with PHP-FPM, which needs a process
  supervisor in one container, and FrankenPHP, which is less established. Apache is capped
  at eight prefork workers to fit the PID and memory limits.
- 2026-10-17: Two PHP strategies, `php_plain_v1` (document root `.` or `public`) and
  `php_laravel_v1` (always `public`). The document root reuses `outputDirectory` and is
  limited to those two values because it is templated into the Apache configuration.
- 2026-10-17: The PHP version is the newest of 8.3/8.4 that `require.php` allows, using a
  small Composer-constraint evaluator in contracts. Composer projects must commit
  `composer.lock`, and the build enforces it. Composer runs in a builder stage on the same
  PHP image so platform checks match the runtime.
- 2026-10-17: Laravel assets build in a separate Node stage only when a build command is
  set, and only `public/build` reaches the runtime image. Migrations, queues, and the
  scheduler are never run.
- 2026-10-17: WordPress is detected and rejected with an explanation until persistent
  storage exists (default from file 11 confirmed).
- 2026-10-17: Java supports Spring Boot only, through `java_maven_v1` and
  `java_gradle_v1`, and requires the project wrapper (`mvnw` or `gradlew`). One Temurin
  JDK builder family then serves both tools, and the tool version is pinned by the
  repository. Alternative rejected: the `maven:` image without a wrapper, which leaves the
  Maven version to the platform and still needs a second path for Gradle.
- 2026-10-17: Approved Java versions are the LTS releases 17, 21, and 25 (default 21), read
  from `pom.xml` or the Gradle build. The build runs `clean` first so a committed `target/`
  or `build/` cannot add stray jars, must yield exactly one jar with a `BOOT-INF/` layout,
  and copies it to a platform-owned name.
- 2026-10-17: The JVM gets `-XX:MaxRAMPercentage=60` plus `ExitOnOutOfMemoryError`, and the
  port is fixed at 8080 through `SERVER_PORT`, which outranks `application.properties`.
  Detection recommends at least 512 MB instead of changing quota defaults.
- 2026-10-17: Java fixture wrappers come from official sources with verified checksums. The
  Maven script-only wrapper 3.3.4 matches Maven Central's SHA-1. The Gradle wrapper jar
  matches the official checksum for Gradle 8.14 to 8.14.5, so the fixture pins Gradle
  8.14.5. Distribution SHA-256 sums are set so the wrappers verify their own downloads.
- 2026-10-20: Registry cleanup gains a `github-packages` deletion mode. GHCR has been
  reported to answer the OCI manifest DELETE with `405`, and the OCI spec lets registries
  disable deletion, so cleanup could otherwise fail on every sweep. The mode deletes
  package versions through the GitHub REST API; the runbook probe chooses the mode, and
  `oci` stays the default. Builds attach provenance and SBOM attestations, so each image
  is an index whose child manifests GHCR keeps as separate versions; deleting only the
  index would leave the layers. The child list comes from the registry at deletion time,
  and each release records its children so a manifest another retained release lists
  (a fully cached rebuild can reuse one) is kept. Cleanup and builds are serialized by
  the pilot's `WORKER_CONCURRENCY=1`, which closes the window between a push and the
  record of its children. The token is read from a worker-only file, not the
  environment that build child processes inherit. Alternative rejected: turning off
  attestations to make each image one manifest, which drops supply-chain evidence.
