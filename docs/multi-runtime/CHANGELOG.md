# Multi-Runtime Changelog

## 2026-10-25

- Phase C passed live; Phase D activated builder control in production (`activate-builder-control.sh`).
  The first pilot, `builder-pilot-next16` (Next.js 16 standalone), was built on the on-demand
  builder, pushed to `ghcr.io/4hprojects/hellodeploy-builds` by digest, deployed, and rolled
  back to the same digest. The other apps answered 200 throughout.
- #145: the Build Service page updates itself; builds are cancelled on app-container (or
  builder) memory pressure rather than system-wide pressure, after a busy desktop session
  cancelled the first pilot build.
- After a worker restart, an adopted builder keeps its real start time and its registry status
  is re-checked.

## 2026-10-23 to 2026-10-24

- Builder control Phase A (audit and design) approved by the owner with conditions; Phase B
  implemented on `feat/builder-control` (#142, not merged): the admin Build Service page, an
  independent `builder-control` queue, admission and in-build monitoring with fixed thresholds,
  Emergency Stop, idle shutdown, startup reconciliation, the builder isolation check (S1), and
  five failure codes. Builder control is off by default. See
  [BUILDER_CONTROL_DESIGN.md](BUILDER_CONTROL_DESIGN.md).
- Found while designing: `BUILD_EXECUTOR=remote-buildkit` would route legacy Node builds to the
  remote builder too, so builder control uses its own `BUILDER_CONTROL_*` settings and leaves
  `BUILD_EXECUTOR=local`.
- The unused `hellodeploy-dev-builder` was removed from the host with owner approval.

## 2026-10-21

- #120 (P4 owner images) merged at the owner's request and autodeployed (`e54f99b`) with
  both P4 flags off, after a flags-off smoke run showed the web service and the worker
  refuse owner-image builds. The security review and live gates now apply to turning the
  flags on.
- #121 committed the pending `.env.example` change, unread, at the owner's request.
- #122 recorded the production check: no `MULTIRUNTIME_*` flag is set and `config:check`
  passes for web and worker.
- #123 judges the Lighthouse lab budgets on the median of three runs; a single run had
  missed the mobile LCP budget by 0.8 ms on a docs-only change.
- Documentation consolidated: this folder gained an overview ([README.md](README.md)), the
  baseline audit moved to `evidence/`, and the original brief is archived at
  `docs/archive/multiruntime-brief-2026-10-16/`.

## 2026-10-20

### #119 merged; first CodeQL run on #120

- #119 merged to `main` and autodeployed to production (`9572051`) with every pilot
  off; the installer's checks passed, and the dashboard and live apps answered 200.
- #120 now targets `main`, so CI and CodeQL run on it. CodeQL flagged two owner-image
  checks it could not recognize as guards: the registry allowlist `includes` (read as a
  URL substring test) and the credential filter built from form input. Both now use
  `isApprovedImageRegistry`: a string that is an own key of `IMAGE_REGISTRIES`. Deleting a
  credential checks it too.

### Pre-merge smoke run

- Ran the branch with every flag off against a throwaway database and the local Docker
  daemon: legacy fixtures, rollback, build and health failures, a pre-branch project
  document, and a v1 job all behaved as expected. See `EVIDENCE.md`.
- Runbook fixture setup now names the build command for `build-failure` and
  `slow-build`, the optimized template for `next14-legacy`, and one owner per project.

### Local registry verification

- Registry cleanup also deletes the referrers fallback tag (`sha256-<child digest>`) that
  ORAS writes for an attestation when the registry has no Referrers API. Without this,
  every build left one tagged index behind. A shared child keeps its fallback tag.
- In `oci` mode, cleanup now deletes the child manifests too, not only the index. Both
  modes run one plan: fallback tags, then children, then the index.
- The ORAS push, child-digest reading, and both cleanup cases were run against a local
  registry; see `EVIDENCE.md`.

### GHCR deletion fallback

- New `REGISTRY_DELETE_API=github-packages` mode deletes platform images through the
  GitHub Packages REST API: child manifests first, then the index, skipping any child
  another retained release lists. The token comes from `GHCR_PACKAGES_TOKEN_PATH` and is
  probed at worker startup.
- Remote builds record the manifests their image index lists (`imageChildDigests`);
  rollbacks copy them and cleanup clears them with the rest of the image identity.
- Runbook step 7 now chooses the deletion mode from a live probe instead of stopping.

### Sixth review

- A lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `composer.lock`)
  larger than the detection response cap counts as present. Detection only checks that
  these exist, and failing on them blocked detection for large repositories.
- A missing application root reports `Application root <path> does not exist at this
commit.` instead of a raw `ENOENT` that named the worker's workspace path.
- The application-root context pass no longer walks dependency and `.git` folders,
  where it neither scrubs links nor counts sizes.
- Boolean names follow the project convention: `isStatic`, `isStreaming`,
  `isAmbiguous`. The unused `applicationRoot` field is gone from the
  build strategy result.
- The runbook requires a live GHCR manifest-deletion probe before any pilot. Whether
  GHCR accepts OCI manifest deletion through the registry API is unverified; the
  probe now chooses between that and the GitHub Packages fallback.
- P4: a prebuilt-image deployment whose private Docker config cannot be written fails
  with `IMAGE_SCAN_UNAVAILABLE` instead of throwing and leaving the deployment
  `BUILDING`, which blocked every later deploy for the project.
- P4: the isolated build Docker config keeps Docker contexts and `currentContext`, so a
  builder defined on a context endpoint still resolves.
- P4: registry API hosts, token hosts, and Docker auth keys live in one contracts table
  (`IMAGE_REGISTRIES`) that defines `APPROVED_IMAGE_REGISTRIES`, so a registry cannot be
  approved without them. `isolateRegistryCredentials` is now
  `shouldIsolateRegistryCredentials`.
- Declined: reusing `getRuntimePlatform` inside `pullAndVerifyImage`. That lookup predates
  the branch and costs one `docker info` per activation.

### Fifth review

Ten findings: nine confirmed and fixed with failing-first tests; one (shared build cache
through `ONBUILD`) mitigated and recorded as a residual risk.

- Remote builds export an OCI layout to the worker, which pushes the exact digest with
  ORAS. The builder never pushes, so a timed-out build can no longer leave an untracked
  image in the registry.
- Owner Dockerfile builds run with an isolated Docker config that holds no registry
  credential, so `ONBUILD` triggers and quoted flags can only pull public images; the
  policy normalizes quotes and escapes like BuildKit.
- A committed `Dockerfile.dockerignore` is removed so it cannot replace the platform
  exclusions.
- Retention clears every record that shared a deleted digest; a scanner outage has its own
  failure code; scans use the runtime platform; shared ownership and blocked-repository
  helpers replace hand-copied checks.

## 2026-10-19

### Fourth review

Ten findings, all confirmed and fixed with failing-first tests.

- Base: rollbacks honor a turned-off pilot; an already-deleted manifest counts as deleted;
  failed detection keeps earlier findings; retention and cleanup share one image
  retirement helper.
- P4: prebuilt-image pulls and scans never use the worker's own registry login; owner
  images and Dockerfiles may not use the platform's image repository; cache mounts are
  refused; owner `.dockerignore` rules keep negations and sit before the platform rules;
  credential-load errors are logged; duplicate CVEs count once; release cleanup also
  removes local copies of prebuilt images.

### Third review

Ten findings; all ten confirmed. Base-branch fixes, each with a failing-first test:

- Saving only the health check no longer resets the build strategy, application root, and
  Python module.
- Rollback to a pre-snapshot release is refused once the project uses a versioned mode.
- Maintenance restores and custom-domain routes keep Next.js server routes unbuffered.
- Deleted registry images also leave the worker disk, and their records stop being
  offered as rollback targets.
- GitHub errors fail detection instead of reading as missing files.
- The application-root pass skips duplicate size accounting.

### Second review

A deeper review reported fifteen findings; fourteen were confirmed and fixed with
failing-first tests (seven here, the rest on the P4 branch). One was declined: the second
build-context walk over the application root is not redundant, because it removes
symlinks that leave the application root for elsewhere in the repository.

- Rollbacks run local images by their unique tag and carry the source's image identity,
  so cleanup no longer removes a live rollback's image by ID.
- The snapshot fixes the source repository; release cleanup records deleted manifests;
  legacy payloads require a commit SHA; settings stay editable after a pilot is turned
  off; Spring Boot caps Tomcat at 40 threads.

### P4 second-review fixes (on the then-stacked #120 branch)

- Owner images must use a numeric non-zero uid; names (resolved through the image's own
  `/etc/passwd`) and spellings such as `+0` are refused. A final stage may inherit its user
  from an earlier stage or a base image, and the activation check decides.
- The Dockerfile policy rejects custom `# escape` characters, images chosen by build
  arguments the project environment can set, and `localhost` registries.
- Rejected owner images are removed after the pull; fixed-port projects show the port
  input when "Deploy from" is offered.

## 2026-10-18

### P4 review fixes (on the then-stacked #120 branch)

- `USER 00` and other all-zero uids now count as root in both owner-image checks.
- `COPY --from`, `ADD --from`, and `RUN --mount from=` follow the approved-registry rule.

### Code review fixes

A full-branch review found ten defects; all ten were confirmed against the code and fixed
with regression tests (eight here, two on the P4 branch).

- Existing projects have no stored `environmentVersion`; the post-build fence would have
  failed every v2 deploy with `CONFIGURATION_CHANGED`. Fixed, and the first secret change
  after the upgrade is now detected.
- Failed local builds were removed by the shared image ID with `--force`, which could
  delete a retained release's rollback image. Removal uses the unique tag.
- Detection resets a strategy whose runtime changed; retries run the readiness guard.
- `REGISTRY_MANIFEST_DELETE_ENABLED=false` is honored; retention and cleanup stop
  repeating finished registry work; `node_modules` and `.git` count toward the context
  size limit again; manifest-delete failures are logged.

### Close-out

- Replaced two regexes CodeQL flagged as polynomial ReDoS (requirements comments and
  Composer hyphen ranges) with linear parsing.
- Added the `php-laravel` fixture generated by Composer, with its lockfile excluded from
  formatting.
- Browser and accessibility suite: 31/33; the two failing visual baselines fail identically
  on `main`, so they reflect local rendering, not this branch.

## 2026-10-17

- Registered nonproduction pilot databases with a structured
  `deployment-environment` marker (`HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID`).
  Production now registers only an unmarked database and refuses any other marker.
  A development worker refuses every marked database, with or without Nginx routing.
- Rejected a nonproduction environment id on a `NODE_ENV=production` worker.
- The acceptance coordinator refuses production databases and mismatched environment
  ids, and decrypts the private canary to compare it in constant time.
- Build context inspection is one iterative walk with no depth cutoff, so deeply
  nested symlinks and files can no longer bypass containment or the 500 MB ceiling;
  names such as `..cache` are no longer mistaken for escapes.
- Pulled digest images must match the runtime Docker daemon's OS and architecture.
- Fixed the canary-probe test spawning a `file://` URL instead of a path.
- P1 close-out: versioned Next.js server images bind every container interface and
  versioned builds disable Next.js telemetry.
- Detection warns when standard mode lacks a start script or lists `next` only in
  devDependencies, and when a custom `distDir` is configured. The user guide explains
  each warning.

### P5 design

- Recorded the restricted Compose and entitlements ADR. Implementation is blocked at the
  brief's P5 entry gate until P4 is proven live and host headroom is measured.

### P4 owner images (on the then-stacked #120 branch)

- Registry deletion is limited to `USER_IMAGE_REGISTRY`, and cleanup skips images the
  platform does not own.
- Added the `CONTAINER` runtime, `dockerfile_v1` and `oci_image_v1` pilots, the static
  Dockerfile policy, contained owner build-file reads, and negation-free owner ignore
  rules.
- Added digest resolution over the registry API, encrypted per-project registry
  credentials with a Settings screen, Trivy scanning, and the activation-time image policy.
- Added the `dockerfile-node` and digest-pinned `oci-nginx` fixtures, threat model,
  runbook, and user guide sections.

### Rollback fix

- Rollback now resolves only the runtime spec from the source snapshot. It used to
  regenerate the Dockerfile, which requires the interpreter version read from the build
  context, so rolling back any Python, PHP, or Java release threw before starting.

### P3B Java

- Added the `JAVA` runtime, `java_maven_v1` and `java_gradle_v1` strategies, Java 17/21/25
  selection from the build file, and the `MULTIRUNTIME_JAVA_V1_*` pilot flag.
- Detection recognizes Spring Boot Maven and Gradle builds, requires the wrapper, rejects
  multi-module builds and non-Spring Boot Java, suggests `/actuator/health` when Actuator
  is present, and recommends 512 MB.
- Java images build with the wrapper on a Temurin JDK, require exactly one Spring Boot
  executable jar, and run it on the Temurin JRE as uid 10001 with a 60% heap cap.
- The build form offers the build tool; detection results can now carry a health check
  path.
- Added Maven and Gradle Spring Boot fixtures with checksum-verified wrappers.

### P3A PHP

- Detection lets a recognized backend framework own repositories where Node found only a
  frontend build, a static site, or nothing.
- Added the `PHP` runtime, `php_plain_v1` and `php_laravel_v1` strategies, PHP 8.3/8.4
  selection from `require.php`, and the `MULTIRUNTIME_PHP_V1_*` pilot flag.
- Detection recognizes plain PHP (root or `public/`), Laravel, and WordPress (rejected),
  requires `composer.lock`, and builds Laravel assets when `package.json` has a build
  script.
- PHP images run Apache with mod_php as `www-data` on port 8080, deny dotfiles, Composer
  metadata, and `vendor/`, cap workers at eight, and make only Laravel storage writable.
- The build form offers the app type and document root; deploys ask an enabled PHP project
  to save its app type first.
- Added plain PHP and Composer-autoload fixtures. A Laravel fixture is still pending (see
  STATUS).

### P2 Python

- Added the `PYTHON` runtime, Flask/FastAPI/Django strategies, the `applicationModule`
  build setting, the approved Python version list, and the `MULTIRUNTIME_PYTHON_V1_*`
  pilot flag with the same isolated-build requirements as Next.js.
- Detection recognizes the three frameworks, requires `requirements.txt` and the matching
  server package, suggests the entry module, and warns about unpinned requirements.
  Entry-point files are fetched only for repositories with Python markers.
- Python images install into a venv, run as uid 10001, and start gunicorn or uvicorn on
  `0.0.0.0`. Context exclusions now also drop virtualenvs and bytecode.
- The build form offers the framework and module for allowlisted projects and explains the
  pilot to the rest; deploys check strategy readiness through one guard.
- Added pinned Flask, FastAPI, and Django acceptance fixtures; the coordinator now also
  verifies each fixture project's application module.
- Fixed a latent Next.js pilot bug: the worker allowlist was an array, so every allowlisted
  build would have thrown and an empty allowlist was never rejected.

## 2026-10-16

- Added versioned build strategies and normalized application roots.
- Added deployment configuration snapshots and environment revision fencing.
- Added v2 build/activation payloads with v1 compatibility.
- Added remote Buildx push, digest persistence/pull, GHCR retention, and readiness
  probes without a local fallback.
- Added Next.js standard, standalone, and export detection/templates plus streaming
  route policy and default-off allowlisted UI.
- Preserved the legacy generated templates byte-for-byte.
- Added a preflight-first nonproduction acceptance coordinator with protected config,
  exact environment confirmation, separately gated disruptive suites, and sanitized
  JSON/Markdown evidence.
- Added tracked Static, React/Vite, Vue/Vite, Express, Node.js, Next.js 14/15/16, and
  resilience fixtures with pinned dependencies and committed npm lockfiles.
