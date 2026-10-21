# P3–P4 — Build Metrics, Storage and Safe Cleanup

## Measurements to add

- `buildStartedAt`, `buildCompletedAt`, `buildDurationMs` on deployment, with optional fields and no blocking schema migration.
- Resolved image ID from `docker image inspect` after successful build; avoid fragile parsing from stdout/stderr (`build.js` currently parses text and sometimes falls back to tag).
- `imageSizeBytes` from structured image inspect `Size` property. Label as logical image size, _not_ unique disk space.
- `templateVersion`, `baseImageProfile`, `cacheMode` as internal, sanitized deployment metadata.
- `buildContextSizeBytes` may already be available from `prepareBuildContext`; avoid duplicate expensive traversal.
- Cache hit/miss stats only if reliable machine-readable builder output is available; otherwise omit instead of inventing values.
- Admin-only disk breakdown via `docker system df` and/or structured equivalent. Label reclaimability as estimates and account for shared layers.

## System design

- Make telemetry best effort: `docker image inspect` failure must not mark a successful image build as failed; return `null` metrics and structured warning.
- Retain existing deployment imageTag and status-state-machine behavior. Persist metrics through existing persistence paths, with explicit tests for old deployments missing fields.
- Do not store complete build log output or sensitive build argument values in metrics documents.
- Add a simple deployment details summary only after backend metrics are proven. Default user-facing language: “Image size”, “Build duration”, “Optimization profile”; omit percent improvement unless prior comparable image and same runtime are available.
- Admin capacity should show Docker disk consumption separate from image sum and per-project quotas.

## Cleanup and rollback

- Existing `pruneDanglingImages()` invokes `docker image prune --force`; preserve until cleanup gate is designed.
- Retain active + all database-designated healthy rollback images, images referenced by containers, and in-flight candidate images.
- Never run `docker system prune -a --volumes` as a routine cleanup action.
- For any new cleanup job, implement a dry-run candidate list from managed labels and source-of-truth release records; hold an exclusive cleanup/build/rollback lock; check Docker references immediately before each deletion; bound age/count/bytes; log IDs and reason without leaking secrets.
- Shared base image layers are not per-project disk savings. Do not assign reclaimed bytes to a particular user without defensible accounting.
- Build cache cleanup requires explicit age/size policy and safe interaction with concurrent builds; use native BuildKit cache-prune filters only after verifying flags supported by the host.
- Alert an administrator before discretionary pruning when disk is low. Preserve enough free space to complete rollback/build recovery.

## Acceptance tests

- Old deployment records readable; failed telemetry does not fail deploy.
- A running container, healthy previous release, rollback target and queued candidate never deleted.
- Prune lock prevents racing builds/rollback; dry-run returns same expected candidate set without mutation.
- Build metrics omit credentials, private repository URLs and user secret values.
- Image-size UI uses accurate units and explains it is not physical disk reclaimed.
