# HelloDeploy

HelloDeploy is a self-hosted web application deployment platform. It lets users connect GitHub repositories, configure supported applications, deploy them into isolated containers, inspect deployment logs, and roll back to retained healthy releases.

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
