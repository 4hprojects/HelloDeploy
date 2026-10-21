# HelloDeploy Release Policy

Updated 2026-10-21.

## Release source

- `main` is the release branch. Changes reach `main` through reviewed pull requests with CI passing.
- Production ships in one of two ways:
  - **Automatic deploy (the normal path).** The `hellodeploy-autodeploy` timer deploys each new
    `main` commit whose `ci.yml` run passed, by full SHA, through `infrastructure/upgrade.sh`
    (backup, drain, verify, automatic rollback). A commit whose upgrade failed is never retried.
    See [Operations Runbooks › Automatic deploys](OPERATIONS_RUNBOOKS.md#automatic-deploys).
  - **Tagged release (manual).** Annotated semantic-version tags `vMAJOR.MINOR.PATCH` (for
    example, `v1.2.3`) mark a reviewed commit on `main` for a deliberate manual upgrade.
- A release tag must point to one reviewed commit on `main`. Do not move or reuse a published tag.
- Production checkout, deployment records, and operator logs must record the full 40-character
  commit SHA, and the tag when one was used.

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

- A manual upgrade fetches the intended tag or full commit SHA, verifies the full SHA, and checks out that immutable commit (`sudo bash infrastructure/upgrade.sh --ref <full-sha>`). Never deploy a moving branch name.
- Before changing the checkout, record the current full commit SHA as the rollback reference and create the required backup.
- If upgrade verification fails, restore the exact recorded commit using its full SHA, restore compatible dependencies with `npm ci --omit=dev`, and verify service health and routing.
- Never use an abbreviated SHA as the authoritative rollback reference.
- Keep the failed release and rollback outcome in operational logs for incident review.

`infrastructure/upgrade.sh` enforces the immutable reference, backup, verification, and rollback steps for both paths.
