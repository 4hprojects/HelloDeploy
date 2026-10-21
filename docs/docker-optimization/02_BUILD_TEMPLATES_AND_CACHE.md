# P1–P2 — Docker Templates, Context and Build Cache

## Principle

Retain existing output and security boundaries. Optimize the build engine that produces user images, not the HelloDeploy host processes.

## Targeted files

- `apps/worker/src/deployment/dockerfile-generator.js`
- `apps/worker/src/deployment/build-context.js`
- `apps/worker/src/deployment/build.js`
- Caller(s) for Dockerfile generation and CLI invocation (identify by search, no assumed paths)
- `tests/deployment/dockerfile-generator.test.js` and relevant `tests/security/*`, `tests/worker/*`

## P1 build templates

1. Introduce internal `templateVersion: 'legacy'|'optimized-v1'` with legacy current output preserved exactly for existing deployments. Add feature flag at deployment-worker level, default `legacy` until rollout.
2. STATIC: keep unprivileged nginx and port 8080. Only reduce copied material after validating static-site asset conventions.
3. REACT/VUE: keep two-stage Node builder -> unprivileged Nginx runtime, `npm ci`, custom build command and outputDirectory; stage declared browser-public build args only. Evaluate `COPY package*.json` caching while preserving npm lifecycle correctness; test nested assets and generated output.
4. NEXTJS: keep deps -> builder -> standalone runner and non-root. Check `public` directory absent case, output standalone config, runtime path, correct ownership. Don't assume all Next.js repos emit standalone output. Ensure no secret build ARG/ENV is accidentally present in final image.
5. EXPRESS/NODEJS: implement an **opt-in** production build strategy with potential deps/build/runtime separation, but only where package scripts/lockfile and files required during lifecycle are known to work. `postinstall` / `prepare` can depend on source and dev packages. Do NOT universally move `COPY . .` after `npm ci` or universally omit dev dependencies. For ambiguous scripts use legacy path and record reason; don't silently break apps.
6. Default image remains currently pinned `node:22-alpine` until audit validates other images. If offering `node:22-bookworm-slim`, require native-module compatibility and image-size/cold-build benchmarks. Prefer immutable digests after an explicit update process, balancing security patch cadence.
7. Preserve `USER node` or unprivileged nginx in final stage, proper `--chown`, `PORT`, EXPOSE, start-command operators, validation of interpolated fields, and no Docker socket access.
8. Review internal build context policy: currently removes Dockerfile, compose, `.dockerignore`; write platform-controlled `.dockerignore` _after_ sanitization only if security and framework-specific exceptions are tested. Do not re-include `.env` secrets, `.git`, dependencies or forbidden files. Ensure source-required files remain.

## P2 caching

- Benchmark baseline cold build, warm build, modified-source build, changed-lockfile build.
- Normal Docker layer cache already exists. Add BuildKit cache mounts for npm only as optional path if daemon supports it and disk/quota rules are defined. Cache package downloads, never environment secrets or user private output.
- Resource limits and build timeouts remain in place. Inspect whether BuildKit/buildx changes alter `docker build --memory` semantics and enforce limits at worker/container/cgroup level rather than assuming flag compatibility.
- Keep cache key stable across source-only edits but invalidate on lockfile change, template change or base-image digest change.
- Plan builds sequentially on an 8 GB host until CPU/memory measured, with existing job queue and concurrency limits respected.

## Security requirements

- Shell-safe CLI argument arrays, validated paths and env variable names, build args limited to explicitly public values.
- Build context 500 MB ceiling and symlink scrub retained or strengthened.
- No `--privileged`, host network, user Dockerfile/Compose or arbitrary mount.
- Keep runtime secrets injected at container start, not persisted in build cache.
- Strict limits on build logs; secrets redacted even in error paths.

## Regression test matrix

For each runtime STATIC/REACT/VUE/EXPRESS/NODEJS/NEXTJS test Dockerfile shape, build command and output handling, relevant health checks and non-root operation. Explicitly test Node with: plain JS; postinstall requiring source; postinstall requiring devDependency; prebuilt dist; TypeScript compile requirement; native dependency; missing lockfile; custom start operator; whitespace and injection attempts; missing Next.js public directory; invalid output directory.

## Exit gate

Optimized-v1 is feature-flagged, opt-in, and demonstrated to run at least one real representative fixture for each changed runtime. Legacy path remains accessible.
