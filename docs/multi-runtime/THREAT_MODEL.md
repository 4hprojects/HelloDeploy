# Isolated Build Threat Model

## Assets and trust boundaries

Repository source, package lifecycle scripts, dependency tarballs, and generated build
output are untrusted. The web control plane, MongoDB, Redis, Nginx helper, runtime
Docker daemon, BuildKit client certificate, and GHCR credential store are trusted at
different privilege levels and must not be shared with build containers.

The worker clones an exact commit, sanitizes and bounds the context, generates the
Dockerfile, and sends the selected application root to a separately provisioned
rootless BuildKit daemon over authenticated TLS. BuildKit exports the image to the worker as an OCI layout, and the worker pushes exactly that digest to private GHCR with ORAS. The builder never pushes, so a killed build leaves nothing in the registry. The runtime host pulls and starts only the recorded digest.

## Primary threats and controls

| Threat                                                                          | Required control                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path traversal or escaping symlink                                              | Normalized POSIX application-root contract plus `realpath` containment and recursive symlink scrubbing                                                            |
| User Dockerfile requests host mounts, devices, capabilities, or host networking | User Dockerfiles and Compose files are removed; only platform templates build                                                                                     |
| Build reaches the production control plane                                      | Builder host has no MongoDB, Redis, Nginx, runtime-Docker, GitHub, or production-host credentials; network policy denies those destinations                       |
| Credential leakage                                                              | GHCR/BuildKit credentials stay in protected host stores; no token in payload, build arg, label, source, or log; log redaction remains enabled                     |
| Mutable-image substitution                                                      | Buildx metadata digest is validated and persisted; activation and rollback use `name@sha256:digest`                                                               |
| Resource exhaustion                                                             | One deployment job at a time for the pilot, bounded context and timeout, rootless builder cgroup CPU/RAM/PID limits, disk quota, cache pruning, workspace cleanup |
| Registry growth or premature deletion                                           | Retention checks all live/retained digest references before exact digest deletion through ORAS                                                                    |
| Configuration race                                                              | Deployment snapshot is stored at enqueue; environment revision is checked before build, after build, and before activation/rollback                               |
| Streaming corruption/latency                                                    | Next.js server routes disable Nginx response buffering; static/export routes keep buffering                                                                       |

## Runtime-specific controls (P2–P3)

| Runtime | Untrusted build input                                       | Control                                                                                                                                                                                                                                                  |
| ------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python  | `requirements.txt` packages, optional build command         | Installed into a venv in the builder stage; the runtime stage copies only the venv and source and runs as uid 10001. Version and entry module are allowlisted and re-validated before templating.                                                        |
| PHP     | Composer packages and scripts, optional Laravel asset build | Composer runs only from a committed lockfile in a builder stage; the asset stage contributes only `public/build`. Apache runs as `www-data` with dotfiles, Composer metadata, and `vendor/` denied, and the document root is limited to `.` or `public`. |
| Java    | Maven/Gradle wrapper, plugins, and dependencies             | The wrapper and build plugins run only in the builder; the runtime receives one verified `BOOT-INF` jar and runs as uid 10001 with a bounded heap.                                                                                                       |

Every new runtime keeps the existing container profile: `--cap-drop ALL`,
`no-new-privileges`, memory, CPU, and PID limits, loopback-only publishing, and
platform-generated Dockerfiles only.

## Owner images (P4, pilot only)

Owner Dockerfiles run owner code during the build, and prebuilt images run code the
platform never built. Both are untrusted end to end.

| Threat                                                 | Control                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build escapes to the host or reaches the control plane | Dockerfile builds run only on the remote rootless BuildKit host; the job refuses a local executor even if flags were misconfigured. BuildKit grants no `security.insecure` or `network.host` entitlements.                                                                                                                                                                            |
| Dockerfile requests privileged features                | Static policy rejects custom `# syntax` frontends and `# escape` characters, `RUN --security=insecure`, `RUN --network=host`, SSH and secret mounts, `VOLUME`, and images outside docker.io and ghcr.io in `FROM`, `COPY --from`, and `RUN --mount from=`, including through global `ARG` defaults and `localhost`. An `ARG` the project environment can set may not choose an image. |
| Owner build files escape the repository                | The Dockerfile and `.dockerignore` are read before sanitizing through a contained reader: no symlinked file, no path through a link outside the application root, 64 KB limit.                                                                                                                                                                                                        |
| Owner ignore rules re-include secrets                  | Owner `.dockerignore` lines are appended after the platform rules with negations removed.                                                                                                                                                                                                                                                                                             |
| Image runs as root or creates host storage             | At every activation and rollback pull: a numeric non-zero `User` is required (names resolve through the owner's own `/etc/passwd`), declared volumes are rejected, size is capped by `CUSTOM_IMAGE_MAX_MB`, and a rejected image is removed. The container profile (`--cap-drop ALL`, `no-new-privileges`, limits, loopback publish) still applies.                                   |
| Known-vulnerable images                                | The container pilots require `IMAGE_SCANNER=trivy`; fixable critical findings fail the deploy, and a scanner that cannot run fails closed.                                                                                                                                                                                                                                            |
| Mutable tags or substituted images                     | Tags are resolved to a manifest digest at deploy time; activation and rollback use only `name@sha256:digest`.                                                                                                                                                                                                                                                                         |
| Credential leakage to a registry or redirect           | Pull tokens are encrypted per project and registry, sent only to the approved token host for that registry, never on redirects, and written only to a per-pull `DOCKER_CONFIG` directory that is removed afterwards.                                                                                                                                                                  |
| Platform deletes an owner's image                      | Registry deletion is limited to `USER_IMAGE_REGISTRY`; prebuilt images are never removed locally on activation failure.                                                                                                                                                                                                                                                               |

Residual P4 risks: an owner image may still mine cryptocurrency or scan outward within
its CPU, memory, and network limits, and Trivy only reports known, fixable CVEs. Runtime
egress filtering for app containers is not part of this pilot. Abuse handling is in the
runbook.

## Residual risks and non-goals

Package installation requires restricted outbound HTTPS to approved package endpoints:
container image registries, npm, PyPI (`pypi.org`, `files.pythonhosted.org`),
Composer (`repo.packagist.org` and the GitHub archive hosts it points to), Maven Central
(`repo.maven.apache.org`), and Gradle distributions (`services.gradle.org`,
`downloads.gradle.org`, `plugins.gradle.org`). Builder network policy must allow exactly
these and nothing else. Malicious dependency code, Composer scripts, or build plugins can
consume resources inside the builder limit and can print data intentionally made
available to the build. Therefore only public-prefixed values (`NEXT_PUBLIC_*`, `VITE_*`,
`REACT_APP_*`, `VUE_APP_*`) enter a build; private build-time secrets are not supported.
Server modes are single-instance, and container-local caches, sessions, and uploads are not
durable. Owner Dockerfiles and prebuilt images exist only behind the P4 pilot described
above. Persistent volumes, background workers, databases, and Compose remain out of scope.
