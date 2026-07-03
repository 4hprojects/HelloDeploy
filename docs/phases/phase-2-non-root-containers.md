# Phase 2 — Non-root users in app containers

- **Status:** Done
- **Started:** 2026-07-03T10:29:00+08:00
- **Accomplished:** 2026-07-03T20:48:57+08:00
- **Commits:** (this commit)

## Goal

The last open security item (only HIGH) in [IMPROVEMENTS.md](../IMPROVEMENTS.md): user code ran as uid 0 inside containers. Generated Dockerfiles set no `USER` and static runtimes bound port 80 (root-only) in-container.

## Tasks (checklist)

- [x] Static runtimes (STATIC/REACT/VUE): base image switched to `nginxinc/nginx-unprivileged:1.27-alpine` — runs as uid 101, listens on 8080, pid/temp paths under `/tmp` (compatible with the existing `--read-only` + tmpfs hardening in `container.js`)
- [x] Node runtimes (EXPRESS/NODEJS/NEXTJS): `USER node` before `CMD`; app files copied `--chown=node:node` so runtime writes into the app dir (e.g. Next.js `.next/cache`) still work; `npm ci` still runs as root at build time, leaving `node_modules` read-only to the runtime user
- [x] `STATIC_PORT` (8080) exported from `dockerfile-generator.js`; activate/rollback jobs updated: static runtimes now always use `STATIC_PORT` and ignore `buildConfiguration.applicationPort` (the nginx image listens on 8080 regardless, so honoring an override would produce a dead port mapping)
- [x] Dockerfile-generator tests extended: unprivileged image + port 8080 (never 80) for static; `USER node` before `CMD` and `--chown` for node runtimes
- [x] Real `docker build`/`run` attempted — **blocked**: the Docker socket denies this user account (`permission denied ... /var/run/docker.sock`, even outside the sandbox). Verification rests on the generated-Dockerfile assertions plus documented upstream image behavior
- [x] IMPROVEMENTS.md checkbox updated

## Notes

- `container.js` deliberately does **not** pass `--user`: the Dockerfile `USER` covers it, and a runtime `--user` flag would fight images that need a specific uid (nginx-unprivileged is uid 101, node is uid 1000).
- Health checks and nginx routing are unaffected — both target the **host** port (`http://127.0.0.1:${hostPort}`); only the container-internal port changed for static runtimes.
- The detection/build-config UI still shows an "Application port" field for static projects even though it is now ignored at activation — candidate for a small UI hint in Phase 5/6.
- First deploy after this change pulls `nginxinc/nginx-unprivileged:1.27-alpine` (official nginx-maintained image).
- Housekeeping: fixed a stale CSP test (`tests/security/csp.test.js`) that commit `31ca33a` broke by adding the Turnstile origin to `scriptSrc` without updating the test's source regex — it was the only failure in the 490-test suite.

## Verification

1. `node --test tests/deployment/dockerfile-generator.test.js` → 14 pass (3 new non-root suites).
2. Full suite `npm test` → 490 tests, all passing after the stale CSP test fix (489/490 before, the 1 failure pre-existing and unrelated).
3. `npm run lint` clean.
4. Live container run not possible in this environment (Docker socket permission denied) — flagged above; recommend a real deploy of one static + one Node project after this lands.
