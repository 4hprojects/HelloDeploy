# Multi-Runtime Evidence

## Local repository evidence

- Baseline full suite: 1,787/1,789; both failures were the documented inherited-email
  readiness leak. Focused isolated readiness: 9/9.
- First integration run after contracts/worker changes: 137/137 targeted legacy and
  compatibility tests passed.
- New focused tests cover application-root traversal/symlink rejection, Next.js config
  extensions/mode recommendations, three templates, remote Buildx arguments, remote
  builder no-fallback behavior, registry command safety, strategy routing, and Nginx
  streaming buffering.
- Changed-area regression set: 178/178 passed.
- Security, worker, Nginx, operations, and installer suites: 740/740 passed with
  `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`.
- Full suite: 1,805/1,805 passed with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`.
- `npm run lint`, `npm run format:check`, and `npm run config:check` passed.

The full suite initially exposed one stale retry-payload assertion that still expected
the version-1 commit field. The test was updated to assert the version-2 identity-only
payload, its focused rerun passed 5/5, and the complete suite then passed 1,805/1,805.

## External evidence still required

No dedicated builder or private GHCR credentials are available in the current
workspace. Consequently no live remote build, push/pull, route, rollback, registry
deletion, network-isolation, interruption, or resource-exhaustion gate is claimed.
