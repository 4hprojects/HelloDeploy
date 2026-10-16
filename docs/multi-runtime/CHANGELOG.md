# Multi-Runtime Changelog

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
