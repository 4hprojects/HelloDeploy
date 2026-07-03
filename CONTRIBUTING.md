# Contributing to HelloDeploy

## Setup

```bash
git clone https://github.com/4hprojects/HelloDeploy.git
cd HelloDeploy
npm install
cp .env.example .env   # then fill in values — see docs/ENVIRONMENT.md
npm run dev            # starts web (:3000) + worker
```

Local prerequisites: Node 22+, MongoDB, and Redis running on their default ports. Docker is only needed on the machine running the worker's build/deploy jobs; the web app runs without it.

## Quality gates

Run before opening a PR — CI expects all three green:

```bash
npm test               # node --test; uses an in-memory MongoDB, no local db needed
npm run lint
npm run format:check
```

## Conventions

- Code style is enforced by ESLint + Prettier; naming and structure conventions live in [.claude/rules/](.claude/rules/) (kebab-case files with role suffixes, named exports, WHY-comments only).
- Tests use `node:test` with real in-memory MongoDB models (`tests/helpers/worker-db.js`); mock only at system boundaries (docker, git, nginx, network) via the `deps` parameter pattern.
- Never log or commit secrets. Anything user-supplied that reaches a Dockerfile, shell, or nginx config must go through the existing validators/sanitizers.

## Where things live

See the Architecture section in [CLAUDE.md](CLAUDE.md) for the app/package layout, [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for configuration, and [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) + [docs/phases/](docs/phases/) for the current backlog and in-flight work.
