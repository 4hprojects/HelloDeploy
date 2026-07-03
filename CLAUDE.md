# HelloDeploy

Node.js monorepo (npm workspaces) — `apps/web` (Express + EJS) + `apps/worker` (BullMQ) + shared `packages/*`.

## Architecture

Self-hosted mini-PaaS: users connect a GitHub repo, HelloDeploy builds it into a Docker image and serves it on a platform subdomain behind nginx.

- **apps/web** — Express 5 + EJS (server-rendered, session auth, CSRF). Controllers → services → mongoose models. Key surfaces: project CRUD/overview, deployments UI with SSE log streaming, environment secrets (encrypted at rest), admin area (users/projects/quotas/approvals), GitHub webhook + deploy-hook API routes.
- **apps/worker** — BullMQ consumer. Deploy pipeline stages: `build-deployment.job` (clone exact commit → sanitize build context → generate Dockerfile → `docker build`) → `activate-release.job` / `rollback-release.job`, both thin wrappers over `deployment/pipeline.js` (`runReleasePipeline`: port alloc → network → secrets → container start → health check → nginx route → swap → HEALTHY). Retention keeps the last 3 HEALTHY releases.
- **packages/** — `contracts` (shared enums), `database` (mongoose models: User, Project, Deployment, Repository, EnvironmentSecret, Quota, Domain, …), `queue` (Redis/BullMQ setup), `security` (encryption, token hashing, redaction), `auth`, `observability` (logger + audit events), `deployment-core`.
- **Infra assumptions** — MongoDB + Redis; Docker daemon on the worker host; optional nginx (`NGINX_ENABLED`) for routing; TLS terminates upstream. Env reference: `docs/ENVIRONMENT.md`.
- **Tests** — `node --test` under `tests/`, in-memory MongoDB via `tests/helpers/worker-db.js`; system boundaries (docker, git, nginx, HTTP) injected through optional `deps` parameters.

## Commands

```bash
npm run dev          # Start web + worker in parallel
npm run start        # Production start
npm run test         # Run tests (node --test)
npm run test:watch   # Watch mode tests
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format
npm run format:check # Prettier check
```

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
- Security audit → invoke /cso
