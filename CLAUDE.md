# HelloDeploy

Node.js monorepo — web app + background worker + shared packages.

## Project structure

```
apps/
  web/       # Frontend web app
  worker/    # Background job worker
packages/
  auth/
  contracts/
  database/
  deployment-core/
  observability/
  queue/
  security/
```

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
