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
   registry/package endpoints needed by approved templates.
5. On the worker, create a remote Buildx context with the `remote` driver and TLS CA,
   certificate, key, and server name. Files must be readable only by the worker account.
6. Install ORAS for the worker account. Log in to private GHCR through the worker's
   protected Docker credential helper/store using a least-privilege package token.
   Do not place the token in `.env` or shell history.

Set the shared protected environment only after the probes below pass:

```text
BUILD_EXECUTOR=remote-buildkit
BUILD_BUILDER_NAME=hellodeploy-nonprod
USER_IMAGE_REGISTRY=ghcr.io/OWNER/PRIVATE_REPOSITORY
REGISTRY_MANIFEST_DELETE_ENABLED=true
WORKER_CONCURRENCY=1
MULTIRUNTIME_NEXT_V1_ENABLED=true
MULTIRUNTIME_NEXT_V1_PROJECT_IDS=OBJECT_ID
```

The GHCR prefix must be lowercase. The web and worker must receive the same flag and
allowlist. Restarting the worker runs `docker buildx inspect ... --bootstrap` and a
read-only ORAS tag probe. Remote mode never creates a local fallback builder.

## Acceptance and rollback

- Migrate Static, React, Vue, Express, Node.js, and legacy Next.js fixtures first.
- Then test Next.js 15/16 standard, standalone, and export fixtures, including failure,
  cancellation, timeout, health-check preservation, streaming, and digest rollback.
- Verify build cleanup, cache/disk limits, log redaction, unauthorized registry denial,
  and network denial to each production control-plane endpoint.
- Confirm a retained digest cannot be deleted and an unreferenced digest is removed.

To stop the pilot, set `MULTIRUNTIME_NEXT_V1_ENABLED=false`, restart web and worker,
and leave retained digest records/images intact. Do not remove the remote builder or
registry credentials until in-flight jobs have drained. Existing projects without a
strategy continue using `legacy_generated` behavior.
