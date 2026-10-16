# Multi-Runtime Changelog

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
