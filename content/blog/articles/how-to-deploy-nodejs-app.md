---
id: lh-deploy-nodejs-app
slug: how-to-deploy-nodejs-app
title: "How to Deploy a Node.js Application: A Beginner's Step-by-Step Guide"
description: Prepare a Node.js and Express app for production, choose where to host it, and deploy, check, debug, and roll it back with confidence.
category: deployment-guides
tags: [nodejs, express, deployment, beginners]
authorId: henson-sagorsor
status: published
featured: true
publishedAt: '2026-10-29'
difficulty: beginner
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/how-to-deploy-nodejs-app.png
testedEnvironment:
  summary: >-
    The example app, port binding, graceful shutdown, and npm ci steps were run in a disposable
    node:26-bookworm-slim Docker container with Node.js 26.13.0, npm 11.20.0, and Express 5.3.0.
    Hosting-provider steps were not run against a real provider.
  verifiedAt: '2026-10-29'
references:
  - title: Node.js release schedule
    url: https://github.com/nodejs/Release
  - title: Node.js previous releases and support status
    url: https://nodejs.org/en/about/previous-releases
  - title: Express — Production best practices, performance and reliability
    url: https://expressjs.com/en/advanced/best-practice-performance.html
  - title: npm ci documentation
    url: https://docs.npmjs.com/cli/commands/npm-ci
  - title: Git — gitignore documentation
    url: https://git-scm.com/docs/gitignore
  - title: The Twelve-Factor App — Config
    url: https://12factor.net/config
---

Deploying means taking code that runs on your laptop and making it run, reliably, on a computer that other people can reach. For a Node.js app that involves the same handful of steps no matter where you host it: a clean repository, configuration that comes from the environment, a start command, a port, a health check, logs, and a way back when a release goes wrong.

This guide walks through those steps with a small Express app. You do not need a HelloDeploy account; every step works on any host that runs Node.js.

## What you will learn

- How to prepare a Node.js app so it starts the same way everywhere
- Where configuration and secrets belong, and where they must never go
- The difference between build and start, and why the port matters
- How to choose a hosting path that fits the project
- How to check a deployment, read its logs, and roll back

## Prerequisites

- Node.js installed locally. Use a release line that is in Long-Term Support: as of 29 October 2026, Node.js 26 entered Active LTS on 28 October 2026, and Node.js 24 and 22 are in Maintenance LTS until 30 April 2028 and 30 April 2027. Odd-numbered and "Current" releases are not meant for production.
- Git, and a repository on a hosting service such as GitHub.
- Basic comfort with a terminal.

## Step 1: Start from a small, honest app

Here is the example used throughout this guide. It answers on `/` and has a dedicated health-check route.

```js
const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.send('Hello from Node.js');
});

const server = app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
```

Three details in this file decide whether it survives a real host:

1. **The port comes from the environment.** Almost every platform tells your app which port to use through a `PORT` variable. An app that hard-codes `3000` works on your laptop and then fails health checks in production.
2. **There is a cheap health route.** `/healthz` does no database work and returns quickly, so a platform or load balancer can ask "is this process alive?" without side effects.
3. **It shuts down on `SIGTERM`.** Hosts stop processes with `SIGTERM` before a restart or redeploy. Closing the server lets in-flight requests finish instead of being cut off.

## Step 2: Make the repository reproducible

Commit the lockfile (`package-lock.json`). It pins the exact dependency versions you tested. On the server, install with:

```sh
npm ci --omit=dev
```

`npm ci` installs exactly what the lockfile says and fails if `package.json` and the lockfile disagree, which is what you want in production. `--omit=dev` skips test and build-only tools.

Keep generated and private files out of Git with a `.gitignore`:

```text
node_modules/
.env
*.log
```

Declare the scripts a host will run in `package.json`:

```json
{
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=22"
  }
}
```

The `engines` field documents which Node.js versions you support. Some hosts read it to pick a runtime; others ignore it, so treat it as documentation unless your host says otherwise.

## Step 3: Move configuration into the environment

Anything that changes between your laptop and production belongs in environment variables, not in code: database URLs, API keys, the public base URL, feature switches. The Twelve-Factor App calls this strict separation of config from code.

- **Never commit secrets.** If a key was ever committed, treat it as leaked: rotate it, then remove it from the code. Deleting the line does not delete it from Git history.
- **Set `NODE_ENV=production`.** Express and many libraries skip development-only behavior when it is set.
- **Fail early on missing values.** A clear error at startup ("DATABASE_URL is not set") is much easier to debug than a crash on the first request.

## Step 4: Understand build versus start

Some apps need a **build** step before they can run (compiling TypeScript, bundling a front end). The **start** command then runs the result.

| Stage   | Runs                             | Typical command |
| ------- | -------------------------------- | --------------- |
| Install | Once per release                 | `npm ci`        |
| Build   | Once per release, only if needed | `npm run build` |
| Start   | Every time the process starts    | `npm start`     |

Keep the start command fast and free of one-time work. If it runs migrations or downloads assets, every restart repeats that work and slows recovery.

## Step 5: Choose a hosting path

There is no single right host. These are the common shapes:

| Path                                          | You manage                                                | Good for                                                    |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Platform as a Service (managed app platforms) | Code and configuration                                    | Getting live quickly; most student and side projects        |
| Virtual private server (VPS)                  | Operating system, runtime, process manager, reverse proxy | Learning operations; full control at low cost               |
| Your own hardware                             | Everything above, plus power, network, and hardware       | Learning and personal projects where downtime is acceptable |

HelloDeploy, which publishes this Learning Hub, is one platform option: it builds a connected GitHub repository and serves supported app types (including Node.js apps with a reproducible start command) behind its own health checks. Its [supported applications](/supported-apps) page lists exactly what it runs today. On a VPS or your own machine, you run the process yourself; [PM2 and Nginx Explained](/blog/pm2-nginx-nodejs-production) covers that setup.

## Step 6: Deploy and check it

Whatever the host, a deployment is not finished when the upload completes. It is finished when you have checked it:

```sh
curl -fsS https://your-app.example/healthz
```

`-f` makes `curl` exit with an error on HTTP failures, so the command doubles as a scriptable check. Then open the real pages in a browser and try the one action your app exists for.

## Step 7: Read the logs when it fails

Most first deployments fail for a few predictable reasons:

| Symptom                                               | Likely cause                                                              | Fix                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Host says the app "did not become healthy"            | App listens on a fixed port instead of `PORT`                             | Read `process.env.PORT`                        |
| `Error: Cannot find module`                           | Dependency only in `devDependencies`, or lockfile not committed           | Move it to `dependencies`; commit the lockfile |
| Crashes at start with `undefined` config              | Environment variable missing on the host                                  | Set it in the host's configuration             |
| Works locally, `ECONNREFUSED 127.0.0.1` in production | App connects to a database on `localhost` that does not exist on the host | Use the managed database's real address        |
| 502 or 503 from the host                              | Process exited or is still starting                                       | Read the app's logs from its last start        |

Log to standard output (`console.log`) and standard error. Hosts and process managers collect those streams; writing your own log files inside the app usually means nobody can find them.

## Step 8: Plan the way back

A rollback is a deployment of the last version that worked. Make that easy before you need it:

- Deploy from Git commits or tags, so "the previous version" is an exact, known commit.
- Keep database changes backward compatible for at least one release, so the old code can still run against the new schema.
- Know your host's rollback mechanism, or keep the previous release directory around on your own server.

## Security and limitations

This guide gets an app running; it does not make it secure. Before real users arrive, work through [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production). The example app has no authentication, no rate limiting, and no input validation because it has no inputs.

## Frequently asked questions

**Do I need Docker to deploy Node.js?** No. Docker is one way to package an app. Many platforms build from your repository directly, and on a VPS you can run Node.js with a process manager.

**Should I commit `node_modules`?** No. Commit the lockfile and let `npm ci` install dependencies on the host.

**Which Node.js version should I use?** An LTS line your host supports. Check the official release schedule, because support windows end on fixed dates.

## Related guides

- [PM2 and Nginx Explained: Running Node.js Applications in Production](/blog/pm2-nginx-nodejs-production)
- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
