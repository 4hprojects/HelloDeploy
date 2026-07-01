# HelloDeploy

HelloDeploy is a self-hosted web application deployment platform. It lets users connect GitHub repositories, configure supported applications, deploy them into isolated containers, inspect deployment logs, and roll back to retained healthy releases.

## User Documentation

- [User Guide](docs/USER_GUIDE.md)
- [FAQ](docs/FAQ.md)
- [Legal Policies](docs/LEGAL_POLICIES.md)

## Project Documentation

- [Blueprint](hellodeploy-blueprint/00_MASTER_INDEX.md)
- [Infrastructure Notes](infrastructure/README.md)
- [Operations Runbooks](docs/OPERATIONS_RUNBOOKS.md)

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
