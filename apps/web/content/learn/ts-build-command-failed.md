## Quick answer

Dependencies installed and your build command ran and returned an error. The build is your
project's own code, so the cause is usually something in the project rather than the
platform.

## Symptoms

- The deployment fails after installation completes.
- Logs show output from your build tool.
- A message like `command failed with exit code 1`.

## Common causes

- **A genuine error in the project** — a type error, a failed import, a syntax error.
- **A file that exists locally and was never committed.**
- **A case-sensitive path.** `./Components/Button` works on macOS or Windows and fails on
  Linux if the directory is `components`.
- **A missing build-time environment variable** the build expects.
- **A dependency listed as a development dependency** that the build needs.
- **Memory.** A large build can exhaust what is available and be killed.

## How to check

1. Find the **first** error in the build output. The last line is usually just the exit code.
2. Reproduce it locally from a clean checkout — clone into a new directory, `npm ci`, then
   run the build. Not from your working copy, which has your uncommitted files.
3. If it succeeds locally and fails deployed, look for uncommitted files and path
   capitalisation.
4. Check whether the error names a variable or a config value that is missing.

## How to fix

**A real error.** Fix it, confirm the build passes from a clean checkout, and commit.

**An uncommitted file.** Commit it. Check `.gitignore` is not excluding something the build
needs — this happens with generated files people assume are tracked.

**Path capitalisation.** Rename so imports match the directory exactly. Note that git may not
record a case-only rename by default; check the change was actually committed.

**Missing variable.** Add it to the project's environment variables and redeploy. Remember
that anything a frontend build reads ends up in files visitors download, so never put a
secret there.

**Wrong dependency type.** If the build needs it, it belongs in `dependencies`, not
`devDependencies`.

**Memory.** Reduce what the build does, or split it. A build killed for memory often reports
something unhelpful and truncated.

## Verify

Redeploy. The build should complete and the logs should move on to starting the application.

## Related

- [What Is a Build Command?](/learn/what-is-a-build-command)
- [Build Configuration](/docs/build-configuration)
