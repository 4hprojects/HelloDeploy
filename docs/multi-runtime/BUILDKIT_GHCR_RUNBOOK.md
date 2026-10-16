# Rootless BuildKit and GHCR Pilot Runbook

This runbook is for a separate nonproduction builder. Do not enable the feature on the
production host while the acceptance record remains incomplete.

## Provisioning requirements

1. Create a dedicated unprivileged builder account and rootless BuildKit service.
2. Put the service under systemd/cgroup CPU, RAM, swap, PID, runtime, and disk limits.
   Configure BuildKit garbage collection and a per-build cache ceiling.
3. Expose BuildKit only on a private interface using mutually authenticated TLS. Issue
   a client certificate solely to the deployment worker.
4. Deny access from the builder to production MongoDB, Redis, Nginx/helper, runtime
   Docker, host-management networks, and cloud metadata. Allow only DNS and the
   registry/package endpoints needed by approved templates, as listed in
   [the threat model](THREAT_MODEL.md#residual-risks-and-non-goals).
5. On the worker, create a remote Buildx context with the `remote` driver and TLS CA,
   certificate, key, and server name. Files must be readable only by the worker account.
6. Install ORAS for the worker account. Log in to private GHCR through the worker's
   protected Docker credential helper/store using a least-privilege package token.
   Do not place the token in `.env` or shell history.
7. Choose how registry cleanup deletes images. Push a throwaway image to the platform
   repository with ORAS, then run
   `oras manifest delete --force ghcr.io/OWNER/PRIVATE_REPOSITORY@sha256:DIGEST`.
   - If it succeeds, keep the default `REGISTRY_DELETE_API=oci`.
   - If GHCR answers `405`, `UNSUPPORTED`, or `DENIED`, set
     `REGISTRY_DELETE_API=github-packages`. Create a classic personal access token
     with `read:packages` and `delete:packages` (fine-grained tokens cannot manage
     packages), write it to a file readable only by the worker account, and set
     `GHCR_PACKAGES_TOKEN_PATH` to that file. Set `GHCR_PACKAGES_OWNER_TYPE=user` when
     the repository belongs to a personal account. This mode deletes the image's
     platform and attestation manifests and then its index, and keeps any manifest
     another retained release still lists.
   - In either mode, push a second throwaway image and confirm one cleanup sweep removes
     it from the package's version list, including its `sha256-…` referrers fallback
     tag if GHCR created one (`oras repo tags` lists it).

Set the shared protected environment only after the probes below pass:

```text
BUILD_EXECUTOR=remote-buildkit
BUILD_BUILDER_NAME=hellodeploy-nonprod
USER_IMAGE_REGISTRY=ghcr.io/OWNER/PRIVATE_REPOSITORY
REGISTRY_MANIFEST_DELETE_ENABLED=true
WORKER_CONCURRENCY=1
MULTIRUNTIME_NEXT_V1_ENABLED=true
MULTIRUNTIME_NEXT_V1_PROJECT_IDS=OBJECT_ID
MULTIRUNTIME_PYTHON_V1_ENABLED=true
MULTIRUNTIME_PYTHON_V1_PROJECT_IDS=OBJECT_ID
MULTIRUNTIME_PHP_V1_ENABLED=true
MULTIRUNTIME_PHP_V1_PROJECT_IDS=OBJECT_ID
MULTIRUNTIME_JAVA_V1_ENABLED=true
MULTIRUNTIME_JAVA_V1_PROJECT_IDS=OBJECT_ID
HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID=UNIQUE_NONPRODUCTION_ID
```

The first worker start registers the database under that id. Later workers and the
acceptance harness refuse a database registered to another id or to production, so
use the same value as the acceptance `confirmationId`. The GHCR prefix must be lowercase. The web and worker must receive the same flag and
allowlist. Restarting the worker runs `docker buildx inspect ... --bootstrap` and a
read-only ORAS tag probe. Remote mode never creates a local fallback builder.

## Acceptance and rollback

- Migrate Static, React, Vue, Express, Node.js, and legacy Next.js fixtures first.
- Then test Next.js 15/16 standard, standalone, and export fixtures, including failure,
  cancellation, timeout, health-check preservation, streaming, and digest rollback.
- Then test the Flask, FastAPI, and Django fixtures: healthy route, uid 10001 runtime,
  restart behavior, secret redaction, quota limits, and digest rollback. Record build
  duration and peak memory per framework.
- Then test the plain PHP and Composer fixtures: `.php` execution, Composer autoloading,
  `www-data` runtime, denied `composer.json` and `vendor/` paths, the eight-worker cap
  under load, and digest rollback.
- Then test the Maven and Gradle Spring Boot fixtures: wrapper download and checksum, one
  executable jar, uid 10001 runtime, Actuator health, heap behavior at the project memory
  quota, and digest rollback. Record build duration and peak builder memory; give the
  fixture projects a 512 MB quota.
- Verify build cleanup, cache/disk limits, log redaction, unauthorized registry denial,
  and network denial to each production control-plane endpoint.
- Confirm a retained digest cannot be deleted and an unreferenced digest is removed.

To stop the pilot, set `MULTIRUNTIME_NEXT_V1_ENABLED=false`, restart web and worker,
and leave retained digest records/images intact. Do not remove the remote builder or
registry credentials until in-flight jobs have drained. Existing projects without a
strategy continue using `legacy_generated` behavior.

## Acceptance project provisioning

Create one nonproduction project for every entry in
`tests/fixtures/multi-runtime/manifest.json`. All projects use this repository, but
each stores the manifest's distinct `applicationRoot`, runtime, build strategy, and, for
Python fixtures, `applicationModule`.
Set `ACCEPTANCE_PRIVATE_CANARY` only on the `private-secret-probe` project. Give the
`php-laravel` project `APP_KEY` (from `php artisan key:generate --show`),
`SESSION_DRIVER=file`, and `CACHE_STORE=file`: the Laravel 13 skeleton otherwise keeps
sessions and cache in a database the fixture does not have. Configure
the `registry-cleanup` project's `maxRollbackReleases` quota to `1` before running the
optional registry-cleanup scenario; the harness refuses that scenario otherwise.
Set the build command `npm run build` on the `build-failure` and `slow-build` projects:
Node.js projects run a build only when one is set, so without it neither scenario
builds the failing or slow step. Add the `next14-legacy` project to
`USER_IMAGE_OPTIMIZED_PROJECT_IDS`: the fixture has no `public/` directory, which the
`legacy` Next.js template requires. Each owner may run one app by default, so give every
fixture project its own owner or raise that quota.

Create deploy hooks only for these nonproduction fixture projects. Copy
`acceptance-config.example.json` to a path outside the checkout, replace every
placeholder, and protect it:

```sh
install -m 600 docs/multi-runtime/acceptance-config.example.json /protected/path/multi-runtime-acceptance.json
```

The operator environment, not the JSON file, supplies `MONGODB_URI`, Redis settings,
the master key, Docker/Buildx credentials, and ORAS/GHCR credentials. Install Chromium
for Playwright before execution. The baseline SHA must name the healthy fixture commit;
the candidate SHA must be the current branch head containing the intentional build and
health failures. Both must be full public commit SHAs.

## Harness commands

Preflight is read-only and is the default. It checks file permissions, source SHAs,
stored project settings, idle projects, platform readiness, MongoDB, the queue/worker,
the named Buildx builder, GHCR access, and all confirmation inputs:

```sh
npm run acceptance:multi-runtime -- --config /protected/path/multi-runtime-acceptance.json
```

Safe execution requires the exact configured confirmation ID and an absolute evidence
directory:

```sh
npm run acceptance:multi-runtime -- \
  --config /protected/path/multi-runtime-acceptance.json \
  --execute \
  --confirm-environment replace-with-unique-nonproduction-id \
  --evidence-output /protected/path/multi-runtime-evidence
```

Disruptive cases are opt-in and should run only while the nonproduction environment is
otherwise idle:

```text
--with-cancellation
--with-timeout
--with-worker-interruption
--with-resource-pressure
--with-registry-cleanup
```

The interruption case prints a deployment-ID checkpoint after the slow fixture reaches
`BUILDING`; restart only the nonproduction worker and leave the coordinator running.
The egress probe creates and removes a temporary platform-owned context and suppresses
raw BuildKit output. Execution writes mode-`0600` JSON and Markdown reports. Review
those reports against `acceptance-evidence.schema.json` before copying a sanitized
summary into `docs/multi-runtime/evidence/`.

## Owner images pilot (P4)

Enable only after the P0–P3 acceptance record is complete and a security reviewer has
signed off on [the owner-image threat model](THREAT_MODEL.md#owner-images-p4-pilot-only).

1. Install Trivy for the worker account and pre-download its vulnerability database. The
   worker runs `trivy image` against GHCR digests with its own Docker credentials, and
   against prebuilt images with a temporary per-pull config.
2. Set, in addition to the pilot environment above:

   ```text
   IMAGE_SCANNER=trivy
   CUSTOM_IMAGE_MAX_MB=2048
   MULTIRUNTIME_DOCKERFILE_V1_ENABLED=true
   MULTIRUNTIME_DOCKERFILE_V1_PROJECT_IDS=OBJECT_ID
   MULTIRUNTIME_OCI_V1_ENABLED=true
   MULTIRUNTIME_OCI_V1_PROJECT_IDS=OBJECT_ID
   ```

   Allowlist only projects whose owners an administrator has reviewed; the allowlist is the
   approval.

3. Run the `dockerfile-node` and `oci-nginx` fixtures, then confirm each failure case fails
   closed: a Dockerfile with `VOLUME`, `USER root`, `RUN --network=host`, a custom
   `# syntax`, a `quay.io` base image, a symlinked Dockerfile, an image running as root, an
   image declaring a volume, a tag whose digest changes between deploys (rollback must keep
   the old digest), and a private image without a saved credential.

### Abuse controls and incident response

- Watch per-container CPU, outbound connection counts, and build durations for pilot
  projects; one job at a time and the builder cgroup limits bound the blast radius.
- On suspected abuse (mining, scanning, or resource exhaustion): remove the project from
  the pilot allowlist and restart web and worker, then stop the release from the admin
  area. Retained digests stay in place for investigation; prebuilt images are never
  deleted by the platform.
- Record the incident, the image digest, and the owner in the audit log review before
  re-enabling the project.
- Rotate the platform GHCR token if a build log or image suggests credential exposure.
