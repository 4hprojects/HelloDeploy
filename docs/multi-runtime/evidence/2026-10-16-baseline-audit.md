# Multi-Runtime Baseline Audit

Recorded 2026-10-16 before changing production build execution.

## Source and worktree

- Base: `main` at `0234139a7a173edd9ecfbff8f50b60ca8027f5ba`.
- Feature branch: `feat/multi-runtime-deployments`.
- The prior `feat/explain-app-crashes` branch remains intact.
- The untracked planning package under `docs/to do/hellodeploy-multiruntime-codex-plan/`
  (archived on 2026-10-21 as [docs/archive/multiruntime-brief-2026-10-16/](../../archive/multiruntime-brief-2026-10-16/00_START_HERE.md))
  was preserved and is not part of this implementation's owned diff.

## Host and tools

- Node.js `v22.22.1`; npm `11.17.0`.
- Docker `29.9.0`; Buildx `0.38.0`.
- Host memory: 7.2 GiB total, approximately 2.1 GiB available at the latest
  measurement; 4 GiB swap was effectively full.
- Workspace filesystem: 937 GiB total, 808 GiB available.

These measurements are a development-host snapshot only. They do not establish
supported-host capacity, concurrent-build capacity, or production readiness.

## Starting runtime matrix

The platform-owned generator supported Static, React, Vue, Express, generic Node.js,
and a legacy Next.js standalone template. Builds ran through the local Docker daemon,
activation used mutable local tags, project configuration was read after enqueue, and
the repository root was always the build context. Next.js standard server and static
export were not separate contracts.

## Starting gaps

- No versioned build strategy separate from runtime detection.
- No immutable deployment configuration/environment snapshot.
- No environment-revision fence between enqueue, build, and activation.
- No repository-relative application root or symlink containment check for it.
- No registry reference plus immutable digest lifecycle.
- No remote-builder/registry readiness check or remote manifest retention.
- Next.js configuration modes were not detected or owner-confirmed.
- Nginx buffering did not distinguish streaming server modes.

## Baseline test evidence

The initial full suite reported 1,787 passing tests out of 1,789. The two failures
were readiness tests inheriting configured email state from the developer `.env`.
With dotenv disabled, the focused readiness file passed 9/9. Readiness now accepts an
explicit `emailConfigured` dependency and its tests inject `false`, removing the
environment leak without weakening production behavior.
