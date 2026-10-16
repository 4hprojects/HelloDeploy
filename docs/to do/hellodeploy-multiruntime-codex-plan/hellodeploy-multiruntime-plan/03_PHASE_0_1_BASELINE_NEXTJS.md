# Phase 0B and Phase 1: Existing Engine Validation and Complete Next.js

## Priorities

P0: real smoke validation for Static, React, Vue, Express, Node, existing Next.  
P1: Next.js SSR, static export, standalone and normal `next start`.

## Phase 0B tasks

- Re-run current supported fixtures through the actual worker in isolated test infrastructure.
- Verify exact-commit, resource limits, non-root, loopback-only binding, encrypted secrets, sanitized logs, Nginx routing, healthy candidate promotion, failed candidate isolation, rollback, worker restart recovery.
- Record fixture commit SHA, release ID, health result, route, log excerpt and resource use.
- Fix confirmed regressions in minimal, test-first commits before adding runtimes.

## Phase 1 tasks

- Examine Next detector and image builder implementation; document exact supported modes.
- Detect `package.json`, package manager lockfiles, Next version, `next.config.{js,mjs,ts}` output mode. Prefer lockfile-specific reproducible install.
- Support both `next start` and standalone `node server.js`, and static `output: 'export'` using existing static build path.
- Handle standalone `public` and `.next/static` assets; verify correct host/port binding.
- Validate Server Components, route handlers, SSR, Server Actions, `next/image`, middleware/proxy, ISR behavior under single-instance hosting where supported.
- Account for build-time vs runtime environment variable semantics. Do not expose server-only secrets in client bundles.
- Show plain-language unsupported runtime/configuration messages.
- Update docs and add tiny reference fixtures under test directory (not large generated build output).

## Acceptance

- All old runtime fixture tests remain green.
- SSR + route handler + image + assets + standalone + static-export fixture work end-to-end.
- Failed candidate does not replace live release; rollback works.
- Current project schemas and URLs remain valid.
- Commit + report + checks in `09_STATUS_AND_REPORTING.md` before phase 2.

## References

https://nextjs.org/docs/app/getting-started/deploying
https://nextjs.org/docs/app/guides/self-hosting
https://docs.docker.com/guides/nextjs/
