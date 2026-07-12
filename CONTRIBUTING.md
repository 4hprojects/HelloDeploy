# Contributing to HelloDeploy

## Setup

```bash
git clone https://github.com/4hprojects/HelloDeploy.git
cd HelloDeploy
nvm install              # installs/uses the Node.js version in .nvmrc
npm ci                   # reproducible install from package-lock.json
cp .env.example .env   # then fill in values — see docs/ENVIRONMENT.md
npm run dev            # starts web (:3000) + worker
```

Local prerequisites: Node.js 22 (declared in `.nvmrc` and `package.json`), npm 10+, MongoDB, and Redis running on their default ports. If you do not use NVM, install a compatible Node.js 22 release and confirm `node --version` before installing dependencies. Docker is only needed on the machine running the worker's build/deploy jobs; the web app runs without it.

## Quality gates

Run before opening a PR — CI expects the complete baseline to be green:

```bash
npm run lint
npm run format:check
npm test               # node --test; uses an in-memory MongoDB, no local db needed
npm audit --omit=dev --audit-level=moderate
```

## Conventions

- Code style is enforced by ESLint + Prettier; naming and structure conventions live in [.claude/rules/](.claude/rules/) (kebab-case files with role suffixes, named exports, WHY-comments only).
- Tests use `node:test` with real in-memory MongoDB models (`tests/helpers/worker-db.js`); mock only at system boundaries (docker, git, nginx, network) via the `deps` parameter pattern.
- Never log or commit secrets. Anything user-supplied that reaches a Dockerfile, shell, or nginx config must go through the existing validators/sanitizers.

## Where things live

See the Architecture section in [CLAUDE.md](CLAUDE.md) for the app/package layout, [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for configuration, [docs/RELEASE_POLICY.md](docs/RELEASE_POLICY.md) for release and rollback rules, and [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) + [docs/phases/](docs/phases/) for the current backlog and in-flight work.
