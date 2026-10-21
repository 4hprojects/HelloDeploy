# HelloDeploy

HelloDeploy is a self-hosted web application deployment platform. It lets users connect GitHub repositories, configure supported applications, and host them on administrator-controlled Ubuntu infrastructure using isolated Docker releases, Nginx routing, and Cloudflare ingress. HelloDeploy performs the deployment itself; it is not a dashboard for another hosting provider.

## Features

- GitHub App integration with automatic, manual, or approval-gated deployments
- Tiered automatic approval for low-risk projects, with provisional approval when no Admin reviews in time
- Runtime detection with owner-overridable build/start commands, port, and health check path
- Build filters (included/ignored path globs) to skip irrelevant pushes in monorepos
- Deploy hooks — secret URLs for triggering deploys from CI pipelines
- Live deployment logs (SSE), cancel/retry, and rollback to retained healthy releases
- Plain-language reasons for common build and startup failures, and live app uptime on the project overview
- Self-service custom domains with DNS verification and automatic activation, per-project maintenance mode, and notification preferences
- Encrypted environment secrets, per-project quotas, role-based project membership with email invitations, and full audit logging

See the [User Guide](docs/USER_GUIDE.md) for how each feature works, and [Priorities](docs/PRIORITIES.md) for what is being worked on.

## Documentation

- [Documentation Index](docs/README.md)
- [Product and Platform Architecture](docs/PLATFORM_ARCHITECTURE.md)
- [User Guide](docs/USER_GUIDE.md)
- [Blueprint](hellodeploy-blueprint/00_MASTER_INDEX.md)
- [Priorities](docs/PRIORITIES.md) - the single current list of what to work on
- [Multi-Runtime Deployments](docs/multi-runtime/README.md) - Next.js modes, Python, PHP, Java, and owner images (pilots, off by default)

## Local Development

Install dependencies:

```sh
npm install
```

Run checks:

```sh
npm run lint
npm run format:check
npm test
```

Start the web and worker processes with the root `.env`:

```sh
npm start
```

HelloDeploy expects MongoDB and Redis to be reachable from the configured environment. Deployment execution also requires Docker access on the host.
