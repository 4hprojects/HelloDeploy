# Phase 2 — Non-root users in app containers

- **Status:** Pending
- **Started:** —
- **Accomplished:** —
- **Commits:** —

## Goal

The last open security item (only HIGH) in [IMPROVEMENTS.md](../IMPROVEMENTS.md): user code runs as uid 0 inside containers. Generated Dockerfiles set no `USER` and `container.js` passes no `--user`. Mitigations exist (`--cap-drop ALL`, `no-new-privileges`, `--network none` builds), but non-root is the missing layer. Static runtimes currently bind port 80 in-container (a root-only port), so they need an unprivileged port too.

## Tasks (checklist)

- [ ] Add a non-root `USER` to every generated Dockerfile template in `apps/worker/src/deployment/dockerfile-generator.js`
- [ ] Move static runtimes off port 80 to an unprivileged port; update everything that assumes the container port (container start, nginx routing, health checks)
- [ ] Extend dockerfile-generator tests to assert `USER` and port expectations per runtime
- [ ] Attempt a real `docker build`/`docker run` of a generated Dockerfile; if the sandbox blocks the Docker socket, record that here and rely on generated-output assertions
- [ ] Update IMPROVEMENTS.md checkbox

## Notes

## Verification
