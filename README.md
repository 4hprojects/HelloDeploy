# HelloDeploy

HelloDeploy is a self-hosted web application deployment platform. It lets users connect GitHub repositories, configure supported applications, deploy them into isolated containers, inspect deployment logs, and roll back to retained healthy releases.

## Features

- GitHub App integration with automatic, manual, or approval-gated deployments
- Runtime detection with owner-overridable build/start commands, port, and health check path
- Build filters (included/ignored path globs) to skip irrelevant pushes in monorepos
- Deploy hooks — secret URLs for triggering deploys from CI pipelines
- Live deployment logs (SSE), cancel/retry, and rollback to retained healthy releases
- Custom domains with DNS verification, per-project maintenance mode, and notification preferences
- Encrypted environment secrets, per-project quotas, role-based project membership, and full audit logging

See the [User Guide](docs/USER_GUIDE.md) for how each feature works, and [IMPROVEMENTS.md](docs/IMPROVEMENTS.md) for the current engineering backlog.

## Documentation

- [Documentation Index](docs/README.md)
- [User Guide](docs/USER_GUIDE.md)
- [Blueprint](hellodeploy-blueprint/00_MASTER_INDEX.md)
- [P9-P12 Maintenance Summary](docs/P9_P12_MAINTENANCE_SUMMARY.md)

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
