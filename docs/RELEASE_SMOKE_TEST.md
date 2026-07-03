# Release Smoke Test (docker-capable host)

Run after pulling a release that touches the build/deploy pipeline — most recently the non-root container change (`docs/phases/phase-2-non-root-containers.md`), which could not be exercised in the development environment (no Docker socket access).

## 1. Static runtime (STATIC/REACT/VUE)

1. Deploy any static or React/Vue project from the dashboard.
2. First deploy after the non-root change pulls `nginxinc/nginx-unprivileged:1.27-alpine` — expect a one-time image pull in the build log.
3. When HEALTHY:

```bash
docker ps --filter label=hellodeploy.managed=true          # find the container
docker exec <container> whoami                              # expect: nginx (uid 101), NOT root
docker exec <container> sh -c 'nginx -V 2>&1 | head -1'     # nginx runs
curl -sI http://127.0.0.1:<hostPort>/                        # 200 from the mapped loopback port
```

4. Open the site on its platform subdomain — assets and pages serve normally.

## 2. Node runtime (EXPRESS/NODEJS/NEXTJS)

1. Deploy a Node project.
2. When HEALTHY:

```bash
docker exec <container> whoami            # expect: node (uid 1000), NOT root
docker exec <container> id -u             # expect: 1000
curl -s http://127.0.0.1:<hostPort>/      # app responds
```

3. If the app writes runtime files (uploads, Next.js image cache), exercise one such path — writes into the app directory and `/tmp` must succeed.

## 3. Rollback

1. Deploy twice, then roll back to the first release.
2. Expect: rollback goes HEALTHY, the replaced release shows ROLLED_BACK, and the source release's image was reused (no new build).

## 4. If something fails

- `whoami` returns `root` → the image was built before the Phase 2 templates; redeploy (fresh build) rather than rollback.
- Static site 502/connection refused → confirm the container listens on 8080 (`docker port <container>`); the host mapping should be `127.0.0.1:<hostPort>->8080/tcp`.
- Node app crashes writing files → check the path; only the app directory (owned by `node`) and `/tmp` are writable.
