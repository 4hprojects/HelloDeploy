# System Architecture

## Logical Architecture

```text
Browser
  |
  v
Cloudflare -> Cloudflare Tunnel -> Nginx
                                  |-- hellodeploy.online -> Web/API
                                  |-- app.hellodeploy.online -> User container
                                  `-- custom-domain.example -> User container

Web/API -> MongoDB Atlas
       -> Redis/BullMQ -> Deployment Worker -> GitHub
                                      |-----> Docker Engine
                                      |-----> Nginx configuration
                                      `-----> Metrics and logs
```

## Component Responsibilities

### Express and EJS Web Application

- Render public pages and authenticated interfaces using EJS templates
- Serve CSS, images, and browser JavaScript as static assets
- Provide versioned Express API routes for asynchronous interface operations and integrations
- Authenticate users and enforce application permissions
- Validate request schemas
- Manage project configuration
- Submit jobs to the queue
- Display deployment state, sanitized logs, and metrics
- Never execute Git, Docker, Nginx, or unrestricted shell commands

### API Layer

- Expose versioned endpoints under `/api/v1`
- Enforce session and role checks
- Apply rate limits
- Generate idempotency keys for mutations
- Write audit events for privileged actions
- Return stable error codes and correlation IDs

### Deployment Worker

- Consume jobs from BullMQ
- Acquire a project deployment lock
- Prepare isolated build directories
- Fetch exact Git commits
- Run validation and security checks
- Build Docker images
- Start candidate containers under quotas
- Perform health checks
- Update Nginx routes atomically
- Retain or clean releases according to policy
- Stream sanitized logs and status events

### MongoDB Atlas

- Store platform accounts, projects, memberships, deployment metadata, policies, domains, notifications, and audit records
- Store only encrypted secret payloads, never plaintext secret values
- Use indexes and TTL policies documented in the data model

### Redis and BullMQ

- Deployment queue
- Job retries and delayed tasks
- Distributed project locks
- Short-lived status events
- Rate-limit counters where appropriate

Redis is operational state, not the source of truth. Durable deployment state remains in MongoDB.

### Docker Engine

- Isolate user application processes
- Enforce CPU and memory limits
- Provide dedicated networks
- Provide read-only image layers and controlled writable volumes
- Report container state and metrics

### Nginx

- Route domains to candidate or active container ports
- Set forwarding headers
- Apply request-size and timeout policies
- Serve maintenance responses when necessary
- Reload only after `nginx -t` succeeds

### Cloudflare Tunnel

- Expose the local server without opening inbound router ports
- Route the main domain, wildcard subdomains, and approved custom domains
- Provide edge TLS and optional security controls

## Suggested Repository Structure

```text
hellodeploy/
|-- apps/
|   |-- web/                   Express, EJS, routes, and API
|   `-- worker/
|-- packages/
|   |-- auth/
|   |-- database/
|   |-- contracts/
|   |-- queue/
|   |-- security/
|   |-- deployment-core/
|   `-- observability/
|-- infrastructure/
|   |-- docker/
|   |-- nginx/
|   |-- cloudflare/
|   |-- systemd/
|   `-- scripts/
|-- docs/
|-- tests/
|   |-- unit/
|   |-- integration/
|   |-- security/
|   `-- e2e/
|-- .env.example
|-- docker-compose.dev.yml
|-- package.json
`-- README.md
```

The web application keeps public assets outside `src`:

```text
apps/web/
|-- src/
|   |-- routes/
|   |-- services/
|   |-- views/
|   `-- server.js
|-- public/
|   |-- assets/
|   |   |-- brand/
|   |   |-- icons/
|   |   `-- social/
|   |-- css/
|   |-- js/
|   `-- manifest.webmanifest
`-- package.json
```

All application source is JavaScript using ECMAScript modules. Runtime validation, tests, JSDoc, and clear module contracts provide safety without introducing TypeScript.

## Runtime Separation

Production services should run as separate processes or containers:

- `hellodeploy-web`
- `hellodeploy-worker`
- `hellodeploy-redis`
- Nginx on the host or in a carefully designed infrastructure container
- Cloudflare Tunnel service
- User application containers

The worker needs controlled Docker access. Do not expose the Docker socket to the web application.

## Filesystem Layout

```text
/opt/hellodeploy/                 platform release
/var/lib/hellodeploy/builds/      temporary build workspaces
/var/lib/hellodeploy/releases/    release metadata and controlled artifacts
/var/lib/hellodeploy/projects/    approved persistent volumes
/var/log/hellodeploy/             platform logs
/etc/hellodeploy/                 protected configuration
/etc/nginx/hellodeploy.d/         generated routes
```

All directory paths must be configurable. No personal username, Hello project path, tunnel ID, or domain may be hard-coded.

## Network Design

- Web/API joins the platform network only
- Worker joins platform and controlled build networks
- User runtime containers join an application network
- User containers cannot access the Docker socket
- User containers cannot bind host ports directly
- Only Nginx reaches application ports
- Build containers and runtime containers use separate policies
- Outbound access is restricted as platform maturity permits

## Deployment Release Model

Each deployment creates an immutable release:

```text
Project -> Deployment -> Docker image -> Candidate container -> Active release
```

The active release record contains the exact commit SHA, image digest, configuration version, route, health result, and activation time.

## Atomic Routing Strategy

1. Start candidate container on an allocated loopback port.
2. Wait for readiness and health checks.
3. Generate a temporary Nginx route.
4. Validate with `nginx -t`.
5. Atomically replace the project route.
6. Reload Nginx.
7. Verify the public health endpoint.
8. Mark the candidate active.
9. Retire the previous container after a grace period.

If any step fails, preserve the previous active route.

## Local and Public Operation

HelloDeploy can run locally using a LAN address without `hellodeploy.online`. Public hosting requires a resolvable domain or tunnel hostname. Production will use:

- `hellodeploy.online` for the platform
- `*.hellodeploy.online` for hosted projects
- Approved custom domains mapped to specific projects

## Current Server Coexistence

During development:

```text
Existing apps -> PM2 -> Existing Nginx routes
Test apps     -> Docker -> New isolated Nginx routes
```

Do not modify existing HelloTasks PM2 or Nginx configuration until a migration phase is separately approved and backed up.
