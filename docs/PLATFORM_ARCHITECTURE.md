# HelloDeploy Product and Platform Architecture

Updated: 2026-07-13

## Purpose

This document is the implementation-oriented statement of what HelloDeploy is, what it hosts, and where each responsibility runs. The blueprint remains the product source of truth; this document reconciles that blueprint with the current repository and production-readiness work.

## Product Definition

HelloDeploy is a self-hosted web application deployment platform: a small platform as a service operated on administrator-controlled Ubuntu infrastructure. A project owner connects a GitHub repository, configures a supported application, and asks HelloDeploy to build, run, route, observe, and roll back that application.

HelloDeploy is the hosting platform. It is not a dashboard layered over another application-hosting provider, and it does not submit deployments to Render, Vercel, Coolify, or another PaaS. Commercial hosting dashboards may be studied as interaction references, but their infrastructure, product model, terminology, and capabilities are not HelloDeploy dependencies.

## Users and System Boundaries

| Actor or system        | Responsibility                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Platform operator      | Installs and operates HelloDeploy, reviews projects, controls quotas, monitors capacity, and recovers it |
| Project Owner          | Connects a repository, manages project configuration and secrets, deploys, and manages members           |
| Maintainer             | Operates permitted deployments and inspects project status and sanitized logs                            |
| Viewer                 | Reads permitted project and deployment information                                                       |
| Application visitor    | Uses a successfully hosted project through its platform or custom domain                                 |
| GitHub                 | Hosts source repositories and sends signed integration events                                            |
| MongoDB and Redis      | Store platform data and operational queue state; they do not host user applications                      |
| User database provider | Hosts a deployed application's database when that application requires one                               |

HelloDeploy owns account and project state, deployment orchestration, Docker releases, application routing, logs, quotas, and administrative policy. It does not own user Git repositories, user databases, domain registration, billing, or multi-server orchestration in V1.

## Canonical V1 Production Topology

V1 uses one supported Ubuntu 22.04 or 24.04 platform host. Web and worker run as separate systemd services and identities on that host, while Docker and Nginx provide the application execution plane.

```text
Browser or application visitor
              |
              v
      Cloudflare edge/TLS
              |
              v
      Cloudflare Tunnel
              |
              v
          Host Nginx
          |        |
          |        `--> 127.0.0.1:<allocated port> --> hosted project container
          |
          `--> 127.0.0.1:<web port> --> hellodeploy-web
                                            |--> MongoDB
                                            `--> Redis/BullMQ
                                                       |
                                                       v
                                               hellodeploy-worker
                                               |--> GitHub clone/build
                                               |--> Docker Engine
                                               `--> constrained Nginx helper
```

MongoDB Atlas and managed TLS Redis are valid infrastructure choices, but using them does not turn the platform into a hybrid PaaS. They are dependencies shared by the web and worker processes. Local MongoDB or Redis may be used where the supported installation and recovery policy permits it.

## Host Responsibilities and Privilege Separation

| Component            | Runs as/where                | Allowed responsibilities                                                                | Prohibited responsibilities                                    |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `hellodeploy-web`    | Unprivileged system identity | HTTP UI/API, sessions, validation, authorization, project state, queue submission       | Docker access, route-helper access, unrestricted host commands |
| `hellodeploy-worker` | Dedicated worker identity    | Queue consumption, exact-commit builds, Docker lifecycle, health checks, route requests | Serving the public dashboard or accepting browser mutations    |
| Nginx helper         | Constrained privileged unit  | Validate and atomically activate only HelloDeploy-managed route operations              | General shell execution or arbitrary file mutation             |
| Nginx                | Host service                 | Route dashboard, project subdomains, custom domains, and maintenance responses          | Application state or deployment decisions                      |
| Docker Engine        | Host service                 | Build images and run isolated project releases                                          | Exposure to web or user containers                             |
| Cloudflare Tunnel    | Host service                 | Carry public traffic to the host without opening inbound router ports                   | Deployment orchestration                                       |

The single-host model does not mean a single privileged process. OS identities and the helper boundary keep compromise of the public web process from directly becoming Docker or Nginx control.

## Domain Model

- `hellodeploy.online` is the HelloDeploy dashboard, authentication, API, webhook, and deploy-hook host.
- `<project-slug>.apps.hellodeploy.online` is the default hostname for a hosted project.
- An approved custom domain routes to exactly one project.
- Nginx routes only to loopback-published container ports.
- Cloudflare provides public TLS and forwards the original HTTPS protocol through the trusted ingress path.

The dashboard domain and application wildcard are separated to avoid collisions between platform routes and user projects.

## Deployment Lifecycle

1. A verified user creates a project and connects a GitHub repository through the GitHub App.
2. HelloDeploy detects the runtime and validates the build, start, output, port, filter, and health settings.
3. The Owner stores environment variables; values are encrypted before persistence and omitted from ordinary settings pages and logs.
4. After required approval, an Owner or Maintainer requests a deployment, or an eligible signed push webhook creates one.
5. The web process writes durable deployment state and submits a BullMQ job.
6. The worker locks the project, clones the exact commit, sanitizes the build context, and builds a Docker image.
7. The worker starts a constrained candidate container on an allocated loopback port and injects decrypted secrets without logging them.
8. Health checks must pass before the constrained helper validates and atomically activates the Nginx route.
9. The candidate becomes the active release only after routing succeeds. A failed candidate leaves the previous healthy release serving traffic.
10. HelloDeploy retains the configured healthy-release window for rollback and cleans expired artifacts.

## Data and Secret Boundaries

- MongoDB is the durable source of truth for accounts, projects, memberships, repositories, deployments, domains, quotas, encrypted secrets, and audit events.
- Redis/BullMQ stores queue, lock, rate-limit, and short-lived event state; it is not the durable source of truth.
- `HELLODEPLOY_MASTER_KEY` encrypts project environment values and must be identical wherever the authorized web and worker processes need it.
- Session, GitHub App, webhook, email, Turnstile, tunnel, database, and Redis credentials remain outside source control and evidence documents.
- The web process may submit jobs but cannot execute Git, Docker, Nginx, or arbitrary shell operations.
- User containers never receive Docker socket or route-helper access and publish only to loopback host ports.

## Supported and Deferred Scope

V1 supports Static, React, Vue, Express, generic Node.js, and constrained Next.js applications. It includes GitHub integration, manual and eligible automatic deployments, environment secrets, live logs, health checks, project subdomains, approved custom domains, maintenance, rollback, quotas, project roles, and administrative review.

V1 does not include remote deployment agents, multiple deployment nodes, vendor-managed application deployments, Kubernetes, autoscaling, billing, user database hosting, arbitrary Docker Compose, privileged containers, or the deferred runtimes listed in the blueprint.

Separating the dashboard onto a vendor and running the worker on another host is a multi-node control-plane design. It is not an approved V1 topology. If remote workers are proposed later, they require an ADR covering authenticated control-plane communication, job ownership, network trust, secret distribution, routing ownership, failure recovery, and multi-node scheduling.

## Reference UX Boundary

The Project Settings work adapts general interaction patterns observed in a commercial dashboard: grouped settings, read-first fields, explicit editing, inline status, contextual help, sticky navigation, and isolated destructive actions. It does not copy that product's architecture or imply that its previews, regions, instance plans, scaling, networking, disks, jobs, or caching exist in HelloDeploy.

## Repository Mapping

| Product boundary      | Current repository path                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Public control plane  | `apps/web`                                                                               |
| Deployment execution  | `apps/worker`                                                                            |
| Shared contracts/data | `packages/contracts`, `packages/database`, `packages/queue`, `packages/security`         |
| Host lifecycle        | `infrastructure/install.sh`, `upgrade.sh`, `backup.sh`, `restore.sh`, systemd units      |
| Dashboard ingress     | `infrastructure/nginx/hellodeploy-platform.conf.template`                                |
| Project routing       | `apps/worker/src/nginx`, constrained by `infrastructure/nginx/helper-server.js`          |
| Product specification | `hellodeploy-blueprint`                                                                  |
| Readiness evidence    | `docs/IMPLEMENTATION_BATCH_TRACKER.md`, `docs/LIVE_WORKFLOW_ACCEPTANCE.md`, `WORKLOG.md` |

## Architecture Reconciliation Status

The later experimental `hybrid_worker`/worker-only path that assumed a vendor-hosted dashboard has been removed locally from the checklist, preflight, installer, upgrade, verifier, production routing configuration, and their tests. The full single-host installation is the only supported V1 production role. Provider-neutral process-environment loading, local Redis compatibility, and managed `rediss://` support remain available.

Local implementation and automated tests do not prove clean-host behavior. Web/worker privilege separation, service startup, Nginx activation, Cloudflare routing, and rollback still require direct evidence on one supported Ubuntu host. Until those checks pass, production remains **NO-GO**.

## Architecture Acceptance Criteria

- A new contributor can explain that HelloDeploy hosts user applications itself.
- Production guidance names one administrator-controlled Ubuntu platform host for V1.
- The dashboard and hosted-project domain spaces are distinct and consistent.
- Web, worker, Docker, helper, Nginx, and Cloudflare responsibilities are explicit.
- Managed MongoDB or Redis are described as dependencies, not application deployment providers.
- Reference screenshots are described only as UX input.
- Multi-node and remote-worker operation remains deferred unless approved through an ADR.
- Readiness evidence never treats a reachable dashboard as proof that Docker deployment, routing, rollback, or recovery works.
