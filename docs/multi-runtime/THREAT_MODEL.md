# Isolated Build Threat Model

## Assets and trust boundaries

Repository source, package lifecycle scripts, dependency tarballs, and generated build
output are untrusted. The web control plane, MongoDB, Redis, Nginx helper, runtime
Docker daemon, BuildKit client certificate, and GHCR credential store are trusted at
different privilege levels and must not be shared with build containers.

The worker clones an exact commit, sanitizes and bounds the context, generates the
Dockerfile, and sends the selected application root to a separately provisioned
rootless BuildKit daemon over authenticated TLS. BuildKit pushes directly to private
GHCR. The runtime host pulls and starts only the recorded digest.

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
durable. Custom Dockerfiles, arbitrary OCI sources, persistent volumes, background
workers, databases, and Compose remain outside this release.
