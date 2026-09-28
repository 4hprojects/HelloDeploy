## Quick answer

Your deployment stopped while installing packages, before your own code ran at all. The usual
cause is a missing or mismatched `package-lock.json`, because builds install with `npm ci`,
which requires one.

## Symptoms

- The deployment fails early, during installation.
- Logs mention `npm ci`, `npm ERR!`, or a lockfile.
- Nothing from your build command appears — it never started.

## Common causes

- **No `package-lock.json` committed.** `npm ci` requires one and will not generate it.
- **The project locks with pnpm or Yarn.** Those lockfiles are not npm's, and `npm ci` cannot
  use them.
- **The lockfile is out of step with `package.json`.** `npm ci` refuses to reconcile them, by
  design.
- **A private package** the build has no credentials for.
- **A dependency that no longer exists** at the version requested.

## How to check

1. Confirm the failure is in installation, not the build. Nothing of your build command
   should appear in the logs.
2. Check whether `package-lock.json` is committed — not just present locally.
3. Look for `pnpm-lock.yaml` or `yarn.lock` in the repository.
4. Read the first `npm ERR!` line rather than the last.
5. Try a clean install locally: delete `node_modules`, then run `npm ci`. That reproduces
   what the build does.

## How to fix

**No lockfile.** Run `npm install` locally, commit the `package-lock.json` it produces.

**A pnpm or Yarn lockfile.** Generate an npm lockfile and commit it. Keeping both is
confusing but works; what does not work is having neither.

**Lockfile out of step.** Run `npm install` to bring them into agreement, then commit the
result. Do not hand-edit the lockfile.

**Private packages.** Anything requiring authentication needs those credentials available to
the build. If you cannot supply them, the dependency cannot be installed.

**A version that no longer exists.** Update the dependency and commit the new lockfile.

## Verify

Redeploy. Installation should complete and the logs should move on to your build command.

## Still stuck?

If `npm ci` succeeds locally from a clean checkout and fails when deployed, compare what is
actually committed against what is on your machine. An uncommitted file is the most common
difference.
