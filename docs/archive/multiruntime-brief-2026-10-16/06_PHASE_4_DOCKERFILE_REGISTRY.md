# Phase 4: Custom Dockerfile Builds and OCI Registry Images

## Hard prerequisite

Security design review and operationally verified isolated build infrastructure. Executing an attacker-authored Dockerfile is executing attacker-controlled code during build. The existing shared Docker daemon and a constrained **runtime** container do not by themselves establish safe isolation for untrusted **builds**. Public access remains disabled until security reviewers approve and prove isolation.

## Dockerfile builder

- Owner-selectable build context and Dockerfile path restricted to checked-out repository subtree; block traversal, symlink escape, oversized context and `.git`/secret inclusion.
- Support project-specific `.dockerignore` safely; no host volumes, privileged entitlements, host networking, daemon socket or network builds with unrestricted egress.
- Use dedicated build worker/VM or equivalent tested isolation separate from production control plane, limited CPU/RAM/disk/time, egress controls and cleanup. Do not falsely label ordinary Docker isolation as a strong tenant security boundary.
- Build args never used for secrets; use ephemeral build secrets where supported; scrub logs and histories.
- Fix image architecture, resolve final digest, inspect image user, entrypoint, layers, exposed ports and known risks; run policy and vulnerability scan.
- Enforce container runtime profile after building, regardless of image Dockerfile commands.

## OCI image deployment

- Allow approved registries (Docker Hub, GHCR initially); per-project scoped private registry credentials kept encrypted, never returned to client or logged.
- Support immutable `name@sha256:digest`; mutable tag UI resolves and locks digest at deployment time.
- Reject unsupported OS/architecture, registry redirects/credential leakage, overlarge images and policy-disallowed metadata.
- Restrict image pulls by quotas and timeout; clean up images/disk safely without removing healthy rollback layers.

## Go-live gates

- Threat model approved, build isolation verified on separate test host, image scanning in pipeline, denylist tests and adversarial fixtures passed.
- Document abuse controls (crypto mining, egress, scanning, resource exhaustion), incident response and per-user throttles.
- These strategies should remain feature-flagged and initially admin-approved, with no public UI option until proven safe.

## Acceptance

- Safe example Dockerfile and pinned OCI image deploy correctly.
- Attempts for privileged mode, Docker socket, host path, symlink escapes, port collisions, oversized contexts and image/tag mutation fail closed.
- Secrets never enter image metadata, layers or public logs.
