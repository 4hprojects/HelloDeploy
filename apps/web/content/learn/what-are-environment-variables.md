Environment variables are values supplied to a program when it starts, rather than written
inside it.

## What it means

A program usually needs things that are not part of its logic: where the database is, which
API key to use, whether it is running in development or production.

Writing those into the code creates two problems. The values differ between environments, and
some of them are secrets that must not be committed. Environment variables solve both by
supplying values from outside.

```js
const databaseUrl = process.env.DATABASE_URL;
```

The code says _which_ value it needs. The environment decides _what_ it is.

## The same code everywhere

This is the real benefit. One codebase runs on your machine against a local database, and in
production against the real one, with no code change — only different values.

That is also what makes deployment repeatable. The thing you tested is the thing you deploy;
only the configuration differs.

## Secrets

Environment variables are the standard way to supply secrets, because the alternative —
committing them — is so much worse. A key in a repository is visible to everyone with access
and stays in the history after deletion.

But be clear about what they protect against. An environment variable is not encrypted inside
a running process. Anyone who can run code in that environment, or read its memory, can read
the value. What it prevents is the value being _stored_ somewhere it should not be.

## Development and production values

Locally these usually live in a `.env` file, which is **not** committed. The file is a
convenience for your machine; production values are set on the platform instead.

Two things follow:

- A new person cloning the repository has no `.env`, which is why projects ship an example
  file listing the names with placeholder values.
- A variable that exists locally and was never set in production is a deployment failure
  waiting to happen. It is among the most common ones.

## The frontend trap

This one catches people out badly.

Frontend build tools read certain environment variables at build time and write them into the
JavaScript they produce. That is intentional — it is how a frontend gets an API address.

But it means the value is inside the files visitors download. Anyone can read it.

**Never put a secret in a variable a frontend build will inline.** A key that reaches the
browser is public, whatever it is named and whatever the tutorial implied.

## Common mistakes

- **Committing `.env`.** Add it to `.gitignore` before the first commit, not after.
- **Setting it locally and forgetting production.** Works on your machine, fails when
  deployed.
- **Expecting a running program to notice a change.** Values are read at start; a change
  needs a restart.
- **Putting secrets in frontend variables.** As above, and worth repeating.
- **Pasting values into support requests.** Anything shared should be treated as leaked and
  rotated.

## How HelloDeploy handles it

Variables are set on the project, encrypted at rest, and supplied when the container starts.
They are redacted from log output, so a value will not appear in a deployment log.

Because they are supplied at start, changing one needs a redeploy before the running
application sees it. Four names — `PORT`, `NODE_ENV`, `HOST` and `HOSTNAME` — are set by the
platform and cannot be overridden.
