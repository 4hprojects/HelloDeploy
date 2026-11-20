---
id: lh-secure-nodejs
slug: secure-nodejs-before-production
title: How to Secure a Node.js Application Before Production Deployment
description: A pre-launch security checklist for Node.js and Express apps covering secrets, HTTPS, proxies, headers, CORS, sessions, dependencies, CI/CD access, and backups.
category: web-security
tags: [nodejs, express, security, checklist, cors, ci-cd]
authorId: henson-sagorsor
status: published
publishedAt: '2026-10-29'
updatedAt: '2026-11-20'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/secure-nodejs-before-production.png
testedEnvironment:
  summary: >-
    The Helmet headers, removal of X-Powered-By, the login rate limit returning 429 on the sixth
    attempt, trust proxy set to loopback, both CORS configurations, npm audit, and npm ci were run
    in a disposable node:26-bookworm-slim Docker container with Node.js 26, Express 5, helmet,
    express-rate-limit, and cors (exact versions are in the verification record). The GitHub
    Actions settings, backup, restore, and monitoring steps are general guidance and were not run.
  verifiedAt: '2026-11-20'
references:
  - title: Express — Security best practices for production
    url: https://expressjs.com/en/advanced/best-practice-security/
  - title: Express — Express behind proxies
    url: https://expressjs.com/en/guide/behind-proxies/
  - title: Express — cors middleware
    url: https://expressjs.com/en/resources/middleware/cors/
  - title: MDN — Cross-Origin Resource Sharing (CORS)
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
  - title: OWASP Node.js Security Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
  - title: OWASP Secrets Management Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
  - title: OWASP Top 10
    url: https://owasp.org/projects/top-ten
  - title: OWASP Application Security Verification Standard (ASVS)
    url: https://asvs.owasp.org/
  - title: Helmet documentation
    url: https://helmet.js.org/
  - title: npm audit documentation
    url: https://docs.npmjs.com/cli/commands/npm-audit/
  - title: Node.js security best practices
    url: https://nodejs.org/learn/getting-started/security-best-practices
  - title: GitHub Docs — Secure use reference for GitHub Actions
    url: https://docs.github.com/en/actions/reference/security/secure-use
  - title: GitHub Docs — Managing deploy keys
    url: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
---

Your Node.js app works on your laptop. Before strangers can reach it, a few things change: anyone on the internet can send it requests, real users trust it with their data, and mistakes cost more to fix. Security work before a launch is mostly about removing easy wins for an attacker: a leaked key, an unpatched dependency, a login form that accepts a million guesses, an error page that prints a stack trace.

None of the steps below make an application perfectly secure. Together they make it a much harder target, and they make problems easier to notice and recover from.

## What you will learn

By the end of this guide you should be able to:

- **Identify** the common security risks that appear when a Node.js application moves into production.
- **Explain** why HTTPS, safe configuration, secret handling, and dependency maintenance matter.
- **Perform** a basic security checklist against your own deployment, with a way to verify each item.
- **Recognize** when a checklist is not enough and a deeper security review is needed.

## Before you begin

You should be comfortable running a Node.js and Express app locally, using `npm`, and using a terminal. The examples use Express and CommonJS `require`; the ideas apply to other frameworks too. If you have not deployed an app before, read [How to Deploy a Node.js Application](/blog/how-to-deploy-nodejs-app) first.

Try the code examples in a local or test environment, never against a live service you do not own.

## What changes in production

In development, convenience wins: you want fast feedback and detailed errors. In production, the same conveniences become risks, because the audience is no longer just you.

| Area         | Convenient in development                          | Safer in production                                    |
| ------------ | -------------------------------------------------- | ------------------------------------------------------ |
| Errors       | Full stack traces in the browser                   | Generic message to users; details in server logs       |
| Secrets      | A local `.env` file and shared test keys           | Separate keys per environment, stored outside Git      |
| CORS         | Allow every origin so a front-end dev server works | Only the origins you actually serve, or no CORS at all |
| Process user | Your own account, sometimes an administrator       | A dedicated unprivileged user                          |
| Network      | App port reachable directly                        | Only the proxy's ports are public                      |
| Dependencies | `npm install`, development tools included          | `npm ci --omit=dev` from the lockfile                  |
| Database     | One all-powerful user                              | A user with only the permissions the app needs         |

Most of the checklist below is about moving each row from the left column to the right one.

## Start with a threat model

A threat model is a short, written answer to "what could go wrong, and how bad would it be?" Spend ten minutes writing down three things before changing code:

1. **What is valuable?** User accounts, personal data, payment details, API keys, your server itself.
2. **Who can reach it?** Anonymous visitors, signed-in users, administrators, other services. List every public entry point: pages, API routes, webhooks, admin panels, file uploads.
3. **What would hurt most?** Data exposed, data lost, the service down, your server used to attack others.

This list decides which items below matter most. A static portfolio and an app that stores customer records do not need the same effort.

## 1. Keep secrets out of code and logs

A secret is any value that grants access: API keys, database passwords, session signing keys, tokens.

- Load secrets from environment variables or a secrets manager, never from files committed to Git. Add `.env` to `.gitignore` before your first commit.
- Give each environment its own keys, so a leaked development key cannot touch production.
- If a secret was ever committed, rotate it. Removing it in a later commit does not remove it from history.
- Never log request bodies, tokens, passwords, or full headers. Log identifiers and outcomes instead.
- Limit who and what can read each secret. The OWASP Secrets Management Cheat Sheet recommends least privilege for secrets and regular rotation, so a stolen credential only works for a short time.

An environment variable keeps a secret out of your source code, but it does not stop that secret appearing in logs, error reports, or a screenshot of your hosting dashboard.

## 2. Use HTTPS everywhere

HTTPS encrypts traffic between the browser and your server, so passwords and session cookies cannot be read or changed on the way. Serve the app only over HTTPS and redirect plain HTTP.

Usually TLS (Transport Layer Security, the protocol behind HTTPS) ends at a reverse proxy such as Nginx, or at a tunnel or CDN in front of the server. [PM2 and Nginx Explained](/blog/pm2-nginx-nodejs-production) shows the Nginx side. Once HTTPS works on every subdomain you use, the `Strict-Transport-Security` header tells browsers to refuse plain HTTP for your site.

## 3. Trust only the proxy you actually have

Behind a proxy, Express sees every request coming from the proxy's address unless you configure `trust proxy`. Configure it narrowly:

```js
// Nginx on the same machine
app.set('trust proxy', 'loopback');
```

The Express documentation warns that `true` trusts whatever the client sends in `X-Forwarded-For` unless the last proxy overwrites it. With the wrong setting, a visitor can choose their own IP address, which defeats IP-based rate limits and corrupts audit logs. In the test for this guide, `loopback` correctly accepted the forwarded address only because the request came from the local proxy.

Count the hops honestly. If traffic passes through two proxies (for example a tunnel and then Nginx), a setting that trusts only one will record every visitor with the same address.

## 4. Set security headers and a narrow CORS policy

Helmet sets a sensible default set of headers, including `Content-Security-Policy` and `Strict-Transport-Security`, and you can remove the `X-Powered-By` header that advertises Express:

```js
const express = require('express');
const helmet = require('helmet');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
```

The default Content Security Policy blocks inline scripts and scripts from other origins. That is the point, but it will break pages that rely on them. Test every page after enabling it, and allow specific sources rather than turning the policy off.

### Risky and safer CORS

Cross-Origin Resource Sharing (CORS) decides whether JavaScript on another website may read your API's responses in a visitor's browser. If your pages and API share one origin, you may not need CORS at all.

A common way to make a CORS error disappear during development is this illustrative, **risky** configuration:

```js
// Risky: reflects any Origin and allows cookies
app.use(cors({ origin: true, credentials: true }));
```

`origin: true` copies whatever `Origin` the request sends into `Access-Control-Allow-Origin`. Combined with `credentials: true`, any website a signed-in user visits can call your API with that user's cookies and read the answer. In the test for this guide, a request from `https://evil.example` was approved.

The **safer** version lists the origins you trust:

```js
// Safer: only your own front end may make credentialed requests
app.use(cors({ origin: ['https://app.example.com'], credentials: true }));
```

With this setting, the same request from `https://evil.example` received no `Access-Control-Allow-Origin` header, so the browser blocks the page from reading the response.

CORS is not access control. Browsers enforce it; tools such as `curl` ignore it. Your API still needs authentication and authorization on every route.

### Cap request size

Limit how much data a single request can send, so one client cannot exhaust memory: `express.json({ limit: '100kb' })`. Set similar limits for file uploads and URL-encoded forms.

## 5. Limit repeated attempts

Login, password reset, sign-up, and any endpoint that sends email or costs money should have a rate limit:

```js
const { rateLimit } = require('express-rate-limit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 });
app.post('/login', loginLimiter, handleLogin);
```

With this configuration the sixth attempt within 15 minutes receives `429 Too Many Requests`. The default store keeps counts in the process's memory, so counts reset when the app restarts and are not shared between instances. If you run more than one instance, use a shared store such as Redis.

## 6. Validate input and encode output

- Validate every request field at the boundary: type, length, allowed values. Reject what you do not expect rather than trying to clean it.
- Use parameterized queries or your database library's query builder; never build queries by joining strings with user input.
- Let your template engine escape output (in EJS, `<%= %>` escapes, `<%- %>` does not).

## 7. Handle sessions and authentication carefully

- Hash passwords with a slow, salted algorithm such as Argon2id or bcrypt. Never store them reversibly.
- Set session cookies with `HttpOnly` (scripts cannot read them), `Secure` (sent only over HTTPS), and `SameSite`, and give them a generic name rather than the library default.
- Regenerate the session identifier after sign-in to prevent session fixation.
- Protect state-changing forms against cross-site request forgery with tokens or `SameSite` cookies plus origin checks.

## 8. Run with the least privilege

Least privilege means every user, process, and credential gets only the access it needs, so one compromise does not hand over everything.

- Run the Node.js process as an ordinary user, never as `root`.
- Expose only the ports that must be public (usually 80, 443, and SSH). The app's own port should listen on `127.0.0.1` or be blocked by the firewall.
- Give database users only the permissions the app needs. An app that never drops tables should not be able to.
- Make application files readable by the app user but writable only where the app must write, such as an uploads directory.

## 9. Protect deployment access and CI/CD credentials

Your deployment pipeline can change production, so an attacker who controls it controls your app. CI/CD (continuous integration and continuous delivery) systems such as GitHub Actions often hold the most powerful credentials you have.

- Turn on two-factor authentication for your Git host, hosting provider, and domain registrar.
- Give the automatic `GITHUB_TOKEN` the minimum permissions it needs. GitHub's guidance is to grant only what each workflow or job requires:

```yaml
permissions:
  contents: read
```

- Pin third-party actions to a full-length commit SHA rather than a tag that can be moved.
- Do not place untrusted input, such as a pull request title, directly in a `run:` script. GitHub recommends passing it through an environment variable instead.
- If a server only needs to pull code, use a deploy key. GitHub documents that a deploy key grants access to a single repository and is read-only unless you give it write access.
- Store deployment credentials as encrypted secrets in your CI system, and remove access for people and tools that no longer need it.

## 10. Keep dependencies current

Check installed dependencies against known advisories:

```sh
npm audit --omit=dev
```

`--omit=dev` limits the report to what runs in production. Review each finding: not every advisory affects how you use a package, but "high" and "critical" findings in reachable code deserve a fix before launch. Install from the lockfile on the server with `npm ci --omit=dev`, so production runs exactly the versions you audited.

Stay on a supported Node.js release line; unsupported versions stop receiving security fixes.

## 11. Log, monitor, and fail safely

- Return generic error messages to users and keep stack traces in server logs. In Express, set `NODE_ENV=production` and add your own error handler.
- Record security-relevant events (sign-ins, failed sign-ins, permission changes, admin actions) with who, what, and when, without the secrets involved.
- Watch for the app going down: an external uptime check on a health endpoint costs little and tells you before users do.

## 12. Prove you can restore

A backup you have never restored is a hope, not a backup.

- Back up the database and any uploaded files on a schedule, and keep at least one copy off the server.
- Restore a backup into a separate environment at least once and check the data.
- Write down the steps, so recovery does not depend on one person's memory.

## A pre-launch checklist

Work through each row against your own deployment. The verification commands are illustrative: replace `example.com` and process names with your own.

| Check                                                                    | Why it matters                                     | How to verify                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No secrets in Git; production keys differ from development               | A leaked key gives direct access                   | Search history with `git log -p -S 'part-of-key'`; confirm keys differ per environment                                |
| HTTPS only, HTTP redirected                                              | Protects passwords and cookies in transit          | `curl -sI http://example.com` returns a 301 or 308 to `https://`                                                      |
| `trust proxy` matches the real proxy chain                               | Wrong value lets clients fake their IP             | Log `req.ip` for one request and compare it with your real public IP                                                  |
| Security headers present                                                 | Reduces script injection and protocol downgrade    | `curl -sI https://example.com` shows `content-security-policy` and `strict-transport-security`, and no `x-powered-by` |
| CORS allows only your origins                                            | Stops other sites reading signed-in users' data    | Send `-H 'Origin: https://evil.example'`; no `access-control-allow-origin` in the reply                               |
| Rate limits on authentication and costly endpoints                       | Slows password guessing and abuse                  | Repeat a failed login; expect `429` after the limit                                                                   |
| Input validated, output escaped, queries parameterized, body size capped | Blocks injection and oversized requests            | Send an oversized JSON body; expect `413`                                                                             |
| Passwords hashed; cookies `HttpOnly`, `Secure`, `SameSite`               | Limits damage from a data leak or script injection | Inspect `Set-Cookie` in browser developer tools                                                                       |
| App runs as a non-root user; only needed ports open                      | Contains a compromise                              | `ps -o user= -p <pid>`; `ss -tlnp` shows the app on `127.0.0.1` only                                                  |
| CI/CD tokens least-privilege; 2FA on accounts                            | The pipeline can change production                 | Review workflow `permissions:` and account security settings                                                          |
| `npm audit --omit=dev` reviewed; supported Node.js                       | Known vulnerabilities are the easiest to exploit   | Run the audit; compare `node --version` with the Node.js release schedule                                             |
| Generic error pages; security events logged; uptime monitored            | Hides internals; makes attacks visible             | Trigger an error; the response has no stack trace                                                                     |
| Backups taken and a restore tested                                       | Recovery from loss, mistakes, or ransomware        | Restore into a test database and check record counts                                                                  |

## Common mistakes and misconceptions

- **"HTTPS makes my app secure."** HTTPS protects data in transit. It does nothing about injection, weak passwords, or a leaked key.
- **"CORS protects my API."** CORS only controls what browsers let pages read. Anyone can call your API directly.
- **"Deleting the commit removed the secret."** Git history, forks, and clones keep it. Rotate the secret.
- **"`npm audit` is clean, so my dependencies are safe."** The audit only knows about reported vulnerabilities. Keep updating, and remove packages you do not use.
- **"Helmet is enough."** Headers reduce some risks. They do not validate input or check permissions.

## What this checklist does not cover

This checklist covers common web application risks. It is not a penetration test, and it does not cover every framework, cloud service, or compliance requirement.

Get a deeper review when any of these apply:

- You store sensitive personal data, health records, or payment details.
- Several customers share one system and must never see each other's data.
- You must meet a legal or contractual standard.
- You have had a security incident, or you are not sure whether you have.

The OWASP Application Security Verification Standard (ASVS) is a detailed list of security requirements you can use to plan that review. For high-risk applications, get an independent security assessment.

## Check your understanding

Try to answer each question before reading the answers below.

1. Your app runs behind a tunnel and then Nginx on the same machine. After launch, the login rate limit blocks every user at once. What is the likely cause?
2. You find an API key that was committed six months ago and deleted in the next commit. Is deleting it enough?
3. A teammate fixes a CORS error with `cors({ origin: true, credentials: true })`. What is the risk, and what is a safer fix?
4. Every row of the checklist passes. Your app stores patients' medical notes. Are you finished?

**Answers**

1. `trust proxy` trusts too few hops, so every request appears to come from the tunnel's address and all users share one rate-limit counter.
2. No. The key is still in Git history and any clones. Rotate it, then check logs for use of the old key.
3. Any website can make credentialed requests and read the responses. List only your own front-end origins.
4. No. Sensitive health data needs a deeper review, for example against OWASP ASVS, and usually an independent assessment.

## Key takeaways

- Write a short threat model first; it tells you where to spend effort.
- Development conveniences such as verbose errors, open CORS, and shared keys become production risks.
- Keep secrets out of Git, scope them narrowly, and rotate any that leak.
- Treat your CI/CD pipeline and accounts as part of production.
- Verify each control with a concrete check, and test that you can restore from backup.

## Related guides

- [How to Deploy a Node.js Application: A Beginner's Step-by-Step Guide](/blog/how-to-deploy-nodejs-app)
- [How to Host a Website on an Old Laptop Using Ubuntu](/blog/host-website-old-laptop-ubuntu)
- [PM2 and Nginx Explained: Running Node.js Applications in Production](/blog/pm2-nginx-nodejs-production)
