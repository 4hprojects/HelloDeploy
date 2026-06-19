# Security and Operations

## Threat Priorities

The main risks are untrusted code execution, host compromise, secret exposure, resource exhaustion, malicious repositories, domain hijacking, unauthorized deployments, and destructive administrative mistakes.

## Non-Negotiable Controls

- Web process has no Docker socket access.
- Worker runs under a dedicated service identity.
- User containers are never privileged.
- Host PID, IPC, and network namespaces are not shared.
- Host filesystem mounts submitted by users are rejected.
- Docker socket is never mounted into user containers.
- CPU, memory, process, and storage limits are mandatory.
- Build and runtime timeouts are enforced.
- Secrets are encrypted and excluded from logs.
- GitHub webhooks require signature verification and replay protection.
- Nginx changes require syntax validation and atomic replacement.
- Administrative changes are audited.

## Build Security

- Clone an exact commit SHA, not a mutable branch reference after validation.
- Use per-deployment temporary directories.
- Limit repository and build-context size.
- Run builds with resource and duration limits.
- Remove build directories after completion.
- Prefer generated safe build definitions for detected frameworks.
- Require approval for custom Dockerfiles.
- Reject Docker Compose and privileged directives in V1.
- Scan dependency and image findings when tooling is available; define whether a finding blocks or warns.

## Runtime Security

Apply at minimum:

- Non-root container user where compatible
- Dropped Linux capabilities
- `no-new-privileges`
- Read-only root filesystem where compatible
- Controlled writable temporary directory
- Process limit
- Memory and CPU limits
- Restart policy with loop protection
- Application-specific network
- No direct host port binding beyond allocated loopback routes

## Secret Management

- Use authenticated encryption such as AES-256-GCM through a reviewed library.
- Keep the master key outside MongoDB and source control.
- Version encryption keys and support rotation.
- Mask values in UI and API responses.
- Redact common credential patterns from logs.
- Replace rather than reveal stored values.
- Never include secret values in audit events or error reports.

## Authentication Security

- Argon2id or a suitably configured bcrypt password hash
- Secure, HTTP-only, same-site cookies
- CSRF protection for cookie-authenticated mutations
- Session rotation after authentication and privilege change
- Rate limits for login, registration, verification, and reset flows
- Single-use, expiring, hashed verification and reset tokens
- Recent-authentication checks for privileged actions

## GitHub App Security

- Request minimum repository permissions.
- Store installation identifiers instead of personal tokens.
- Generate short-lived installation tokens only when required.
- Verify `X-Hub-Signature-256`.
- Deduplicate webhook delivery IDs.
- Confirm repository and installation ownership for every event.

## Domain Security

- Normalize hostnames using a trusted parser.
- Block reserved and platform-critical names.
- Require ownership verification for custom domains.
- Prevent duplicate claims.
- Validate Host headers and route only known domains.
- Do not activate routing before verification succeeds.

## Abuse Controls

Prohibit and detect where practical:

- Malware and phishing
- Spam services
- Cryptocurrency mining
- Public proxies and restriction bypass services
- Unapproved file distribution
- Denial-of-service tooling
- Attempts to access host resources

Administrative actions:

- Suspend project
- Stop container
- Revoke sessions and GitHub access
- Preserve relevant audit evidence
- Notify owner with a safe reason category

## Capacity and Reliability

Initial production defaults for the current server:

- One concurrent build
- Admission check before build
- Reserve host memory for Ubuntu, Nginx, Cloudflare Tunnel, HelloDeploy, Redis, and existing applications
- Reject or queue deployments when thresholds are exceeded
- Automatic cleanup of expired build directories and unreferenced images
- No automatic deletion of user projects

Actual safe capacity must be established through tests, not assumptions.

## Backups

Back up:

- MongoDB Atlas according to available plan and export policy
- Encrypted platform configuration
- Nginx route configuration
- Project and deployment metadata
- Approved persistent volumes if introduced
- Audit exports according to retention policy

Do not treat Docker images as the only backup. Source repositories and reproducible builds remain essential.

## Monitoring and Alerts

Monitor:

- Host CPU, memory, disk, load, and temperature when supported
- Queue depth and job duration
- Build failure rate
- Container state and restart count
- Nginx, Docker, Redis, worker, and tunnel health
- Disk growth from images, logs, and build contexts
- Authentication anomalies

Send Super Admin alerts for:

- Server unreachable
- Disk or memory threshold exceeded
- Worker stopped
- Tunnel stopped
- Repeated deployment failures
- Suspicious login or webhook activity

## Incident Runbook Minimum

1. Identify affected service and correlation IDs.
2. Pause new deployments if infrastructure is unstable.
3. Preserve logs without exposing secrets.
4. Stop or isolate malicious containers.
5. Restore previous healthy routing when possible.
6. Rotate compromised credentials.
7. Notify affected users.
8. Document root cause and corrective action.

## Current Server Protection

- Inventory existing PM2 processes and ports before installation.
- Back up Nginx and Cloudflare Tunnel configuration.
- Allocate a separate test subdomain and port range.
- Never overwrite existing routes automatically during development.
- Require explicit migration approval for each existing Hello application.
