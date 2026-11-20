---
id: lh-protect-env-secrets
slug: protect-environment-variables-api-keys
title: How to Protect Environment Variables and API Keys in Production
description: Where secrets in environment variables leak from (Git, front-end bundles, Docker images, logs, child processes) and how to load, limit, and rotate them.
category: web-security
tags: [secrets, environment-variables, api-keys, nodejs, docker]
authorId: henson-sagorsor
status: published
publishedAt: '2026-11-20'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/protect-environment-variables-api-keys.png
testedEnvironment:
  summary: >-
    The --env-file and process.loadEnvFile behavior, the startup check, child process inheritance,
    /proc environ permissions, a deleted secret surviving in Git history, .gitignore, and Vite's
    VITE_ prefix were run in a disposable node:26-bookworm-slim container (Node.js 26.13.0, Git
    2.39.5, Vite 8.3.8). The Docker build argument and secret mount comparison was run with Docker
    29.9.3, and the test images were then deleted. Rotation, secret managers, and history rewriting were not run.
  verifiedAt: '2026-11-20'
references:
  - title: OWASP Secrets Management Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
  - title: The Twelve-Factor App — Config
    url: https://12factor.net/config
  - title: Node.js — Command-line options (--env-file)
    url: https://nodejs.org/api/cli.html
  - title: Node.js — process.loadEnvFile()
    url: https://nodejs.org/api/process.html
  - title: Node.js — Child process (options.env)
    url: https://nodejs.org/api/child_process.html
  - title: Docker Docs — Build secrets
    url: https://docs.docker.com/build/building/secrets/
  - title: Vite — Env variables and modes
    url: https://vite.dev/guide/env-and-mode
  - title: Next.js — Environment variables
    url: https://nextjs.org/docs/app/guides/environment-variables
  - title: GitHub Docs — Removing sensitive data from a repository
    url: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
  - title: GitHub Docs — About secret scanning
    url: https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
---

"Put your API keys in environment variables" is good advice, and most tutorials stop there. But an environment variable only keeps a secret out of your source code. It does not stop that secret from being copied into a front-end bundle, saved inside a Docker image, printed in a log, or handed to every program your app starts.

This guide follows a secret through its life, from your laptop to production, and shows where it can escape at each step. Most of the leaks described here were reproduced in disposable test environments, so you can see the behavior rather than take it on trust; the tested-environment note lists exactly what was run.

## What you will learn

By the end of this guide you should be able to:

- **Explain** what an environment variable is and what protection it does and does not give a secret.
- **Configure** a Node.js app to load secrets safely and refuse to start when one is missing.
- **Identify** seven common ways a secret in an environment variable leaks, and the fix for each.
- **Apply** least privilege and rotation so a leaked key does limited damage.
- **Respond** correctly when a secret has been committed or exposed.

## Before you begin

You should be comfortable running a Node.js app from a terminal and using Git. A few sections mention Docker and front-end build tools; you can skip those if you do not use them. For a broader pre-launch checklist, see [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production).

Use fake values while practicing. Never paste a real key into a test, a chat, or a support ticket.

## What an environment variable is

An **environment variable** is a named text value that the operating system hands to a program when it starts. In Node.js you read them from `process.env`:

```js
const apiKey = process.env.PAYMENT_API_KEY;
```

Every value is a string, and every process gets its own copy, taken from whatever started it: your shell, a process manager such as PM2 or systemd, a container runtime, or a hosting platform's settings page.

The Twelve-Factor App methodology recommends storing configuration, including credentials, in environment variables. Its reasoning holds up: they are easy to change between deployments without changing code, and there is little chance of them being committed by accident. A good test from the same page is to ask whether you could make your repository public right now without exposing any credentials.

The OWASP Secrets Management Cheat Sheet is more cautious. It points out that environment variables are generally readable by every process running as the same user and can end up in logs or crash dumps. Both views are right: environment variables are a sensible default for small projects, as long as you understand where they travel.

## Load secrets safely in Node.js

In development, secrets usually live in a `.env` file:

```bash
PAYMENT_API_KEY=sk_test_example
DATABASE_URL=postgres://app@localhost/app
```

Current Node.js versions can load this file without any package. The `--env-file` flag was added in Node.js 20.6.0 and is no longer experimental as of Node.js 24.10.0 and 22.21.0:

```bash
node --env-file=.env server.js
```

Three details matter in production:

- **The real environment wins.** If a variable is already set, the value in the file is ignored. In the test for this guide, `PAYMENT_API_KEY=from-shell node --env-file=.env` printed `from-shell`.
- **A missing file is an error.** `--env-file` stops with an error if the file does not exist. Use `--env-file-if-exists` (Node.js 22.9.0 and later) when the file is optional, for example on a server where the platform sets the variables directly.
- **You can load from code.** `process.loadEnvFile('.env')` (Node.js 21.7.0 and 20.12.0 and later) does the same from inside your program. On older versions, the `dotenv` package is the common choice.

Keep `.env` out of Git from your very first commit, and commit an example file with the same names and fake values so teammates know what to set:

```bash
# .gitignore
.env
```

```bash
# .env.example (committed)
PAYMENT_API_KEY=
DATABASE_URL=
```

`git check-ignore -v .env` prints the ignore file and pattern that matched if the file is ignored, and nothing if it is not, which is a quick way to confirm the setup.

### Fail fast when a secret is missing

An app that starts without its database password usually fails later, in a confusing way, on the first real request. Check required variables once at startup instead:

```js
// config.js
const REQUIRED = ['DATABASE_URL', 'PAYMENT_API_KEY'];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  // Name the missing variables, never print their values.
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  paymentApiKey: process.env.PAYMENT_API_KEY,
};
```

The rest of the app imports `config.js` instead of reading `process.env` everywhere. That gives you one place that knows which secrets exist, and one place to check that none of them are printed. In the test, starting without the variables exited with an error code and named `PAYMENT_API_KEY` in the error without showing any value.

## Seven ways secrets leak, and how to stop each one

### 1. Committed to Git, then "deleted"

Someone commits `.env`, notices, and removes it in the next commit. The file is gone from the latest version, but not from history. In the test, `git log -p --all` still showed the key after it was removed.

**Fix:** treat any secret that reached a shared repository as exposed, and rotate it (see "If a secret leaks" below). Prevent repeats with `.gitignore`, and turn on secret scanning with push protection where your Git host offers it, so a push containing a recognizable key is refused.

### 2. Bundled into front-end code

Code that runs in the browser cannot keep secrets: anyone can open developer tools and read it. Front-end build tools make this easy to forget, because they read the same `.env` file.

- Vite exposes variables whose names start with `VITE_` to client code, and its documentation warns that these should not contain sensitive information such as API keys.
- Next.js exposes variables starting with `NEXT_PUBLIC_` and inlines their values into the JavaScript bundle during `next build`.

In the test, a Vite build with `VITE_API_BASE_URL` and `DB_PASSWORD` in the same `.env` file put the URL into the built files and left the password out. The prefix is the only thing standing between your secret and the public.

**Fix:** never give a secret a public prefix. If the browser needs to call a paid API, send the request through your own server, which adds the key on the server side.

### 3. Baked into a Docker image

A Dockerfile that passes a token with `ARG` or `ENV` stores it in the image. Docker's documentation says build arguments and environment variables are inappropriate for secrets because they persist in the final image. In the test, building with `--build-arg NPM_TOKEN=...` left the token readable in `docker history --no-trunc`, by anyone who can pull the image.

**Fix:** use a build secret mount. The secret is available to one build step and is not written to the image:

```dockerfile
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci
```

```bash
docker build --secret id=npm_token,src=$HOME/.npm_token .
```

Keep the token file outside the build context, as above; a token file inside the project folder could be copied into the image by a later `COPY . .`. The `npm ci` line is illustrative: npm reads `NPM_TOKEN` only if the project's `.npmrc` contains `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`, and the test used the same mount with a simpler command. In the test, the same token passed this way did not appear in the image history, and `/run/secrets` did not exist in the finished image. Runtime secrets should be supplied when the container starts, not at build time.

### 4. Printed in logs and error reports

Logs are copied to files, log services, and support tickets, and they are often kept longer and shared more widely than the app's own data. Common accidents:

- `console.log(process.env)` or logging a whole config object while debugging.
- Logging full request headers, which include `Authorization` and cookies.
- Error-tracking tools that attach the environment or request body to every report.
- Connection strings in error messages, such as a failed database URL that includes the password.

**Fix:** log identifiers and outcomes, not credentials. If your logger supports redaction (for example, a list of field paths to mask), configure it for `authorization`, `cookie`, `password`, and your secret names. Check what your error-tracking tool sends by default.

### 5. Inherited by every child process

When Node.js starts another program with `child_process`, the child receives a copy of `process.env` unless you pass something else. The test confirmed it: a shell command run with `execSync` printed the parent's `PAYMENT_API_KEY`. If your app runs a video converter, a Git command, or a user-supplied script, all of your secrets go with it.

**Fix:** when running external programs, pass only what they need (the program and file names are illustrative):

```js
const { execFileSync } = require('node:child_process');

execFileSync('ffmpeg', ['-i', 'in.mp4', 'out.webm'], {
  env: { PATH: process.env.PATH },
});
```

### 6. Readable by other processes on the same server

On Linux, a process's starting environment is visible in `/proc/<PID>/environ`. In the test, a second process running as the same user could read the key there, while a process running as a different user was refused. The root user can read it too. Variables loaded from inside the program with `--env-file` or `process.loadEnvFile` are added after start-up and do not appear there; they are protected by the `.env` file's own permissions instead.

**Fix:** run each app as its own unprivileged user, and restrict any file that holds secrets so only that user can read it, for example with `chmod 600 .env`. Avoid running unrelated services under the same account.

### 7. Copied through people and tools

Secrets also leak through ordinary work: a screenshot of a hosting dashboard, a key pasted into a chat to "quickly test something", a CI job that prints its environment, a shared password manager entry that half the company can open.

**Fix:** keep secrets in one place with access limited to the people and systems that need them, mask them in CI output (most CI systems do this for values stored as secrets), and never echo them in build scripts.

## Limit the damage when a key does leak

You will not prevent every leak, so make each secret worth as little as possible to whoever finds it:

- **Least privilege.** The OWASP cheat sheet says secrets should have only the minimum privileges they need. Create a database user that can read and write the app's tables but cannot drop the database, and API keys that are restricted to the endpoints or actions the app uses. Many providers let you restrict a key by IP address, website, or permission scope.
- **One key per environment.** A leaked development key should not touch production data.
- **Rotation.** OWASP recommends rotating secrets regularly so stolen credentials only work for a short time. Rotation means creating a new secret, deploying it, and then revoking the old one. Practice it once before you need it in an emergency.
- **Short-lived credentials.** Where a provider offers tokens that expire after minutes or hours, prefer them over keys that live forever.

## When to move beyond environment variables

For a single small app, environment variables set by your platform or process manager are a reasonable choice. Consider a dedicated secret store when several services share secrets, many people need different levels of access, you must audit who read what, or you rotate frequently.

The options include a secrets manager from your cloud provider or a self-hosted tool such as HashiCorp Vault, and orchestrator features such as Docker or Kubernetes secrets that place each secret in a file only the app can read. The goal is the same either way: fewer copies of each secret, readable by fewer things, with a record of access.

## If a secret leaks

Act in this order. The first step matters most.

1. **Revoke or rotate the secret.** GitHub's guidance is explicit: rotate or revoke first, because once that is done the leaked value is useless, whatever else happens. Deleting a file does not do this.
2. **Check for misuse.** Review the provider's logs or billing for activity you do not recognize since the leak.
3. **Find out how it leaked** and close that path, using the list above.
4. **Clean up history if needed.** If the secret is in Git history, GitHub recommends the `git-filter-repo` tool to rewrite it, followed by a force push. Rewriting history affects everyone with a clone, and copies may already exist elsewhere, which is why it never replaces step 1.

## Common mistakes and misconceptions

- **"It's in an environment variable, so it's secure."** It is out of your code, nothing more. Check the seven leak paths above.
- **"The repository is private."** Private repositories are cloned to laptops, CI runners, and third-party tools, and access lists grow over time.
- **"I deleted the commit."** The secret stays in history, in every existing clone, and possibly in caches. Rotate it.
- **"Only the server sees `.env`."** Front-end build tools read it too, and any variable with a public prefix ends up in the browser.
- **"We'll rotate if something happens."** If you have never rotated a key, you do not know how long it takes or what breaks. Practice it calmly first.

## Check your understanding

Try to answer each question before reading the answers below.

1. You set `STRIPE_SECRET_KEY` in `.env` and renamed it `VITE_STRIPE_SECRET_KEY` so your React code could read it. What happened?
2. Your Dockerfile contains `ARG GITHUB_TOKEN` and uses it to install a private package. The final image never uses the token. Is it safe?
3. A key was committed to a private repository three months ago. You remove it with `git-filter-repo` and force-push. Are you done?
4. Your app runs `ffmpeg` with `child_process.spawn` and no `env` option. Which secrets can `ffmpeg` see?

**Answers**

1. The key was inlined into the browser bundle, so anyone visiting the site can read it. Rotate it and move the API call to your server.
2. No. Build arguments persist in the image history. Use a secret mount and rotate the token if the image was shared.
3. No. Rotate the key first and check the provider's logs; the history rewrite is cleanup, not containment.
4. All of them. Without `env`, a child process inherits the parent's whole environment. Pass only `PATH` and anything `ffmpeg` truly needs.

## Key takeaways

- Environment variables keep secrets out of source code, not out of everything else.
- Validate required secrets at startup and read them through one config module.
- Watch the seven leak paths: Git history, public prefixes, image layers, logs, child processes, shared users, and people.
- Give every secret the least privilege it needs, one per environment, and practice rotating it.
- When a secret leaks, rotate first; cleaning history comes after.

## Related guides

- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
- [What Is DevSecOps? A Beginner's Guide to Secure Software Deployment](/blog/what-is-devsecops)
- [How to Deploy a Node.js Application: A Beginner's Step-by-Step Guide](/blog/how-to-deploy-nodejs-app)
