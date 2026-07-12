# HelloDeploy Release Policy

## Release source

- `main` is the release branch. Changes reach `main` through reviewed pull requests with required CI checks passing.
- Production releases use annotated semantic-version tags in the form `vMAJOR.MINOR.PATCH` (for example, `v1.2.3`).
- A release tag must point to one reviewed commit on `main`. Do not move or reuse a published tag.
- Production checkout, deployment records, and operator logs must record the tag and its full 40-character commit SHA.

## Release gate

Create a release only from a clean worktree after running, on Node.js 22:

```sh
npm ci
npm run lint
npm run format:check
npm test
npm audit --omit=dev --audit-level=moderate
git diff --check
git status --short
```

`git status --short` must be empty after installation and verification. Required staging or target-host checks in the deployment-readiness roadmap must also have recorded evidence before a production go decision.

## Upgrade and rollback references

- Upgrade by fetching the intended annotated tag, verifying its full commit SHA, and checking out that immutable commit. Do not deploy the current tip of a moving branch by default.
- Before changing the checkout, record the current full commit SHA as the rollback reference and create the required backup.
- If upgrade verification fails, restore the exact recorded commit using its full SHA, restore compatible dependencies with `npm ci --omit=dev`, and verify service health and routing.
- Never use an abbreviated SHA as the authoritative rollback reference.
- Keep the failed release and rollback outcome in operational logs for incident review.

The lifecycle scripts must enforce these rules before production release readiness can be marked complete. Until then, operators must supply and verify immutable references explicitly.
