---
id: lh-secure-nodejs
slug: secure-nodejs-before-production
title: How to Secure a Node.js Application Before Production Deployment
description: A practical pre-launch security checklist for Node.js and Express apps covering secrets, HTTPS, proxies, dependencies, sessions, rate limits, logging, and backups.
category: web-security
tags: [nodejs, express, security, checklist]
authorId: henson-sagorsor
status: published
publishedAt: '2026-10-29'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/secure-nodejs-before-production.png
testedEnvironment:
  summary: >-
    The Helmet headers, removal of X-Powered-By, the login rate limit returning 429 on the sixth
    attempt, trust proxy set to loopback, npm audit, and npm ci were run in a disposable
    node:26-bookworm-slim Docker container with Node.js 26.13.0, Express 5.3.0, helmet 8.3.0,
    and express-rate-limit 8.7.1. Backup, restore, and monitoring steps are general guidance and
    were not run.
  verifiedAt: '2026-10-29'
references:
  - title: Express — Security best practices for production
    url: https://expressjs.com/en/advanced/best-practice-security.html
  - title: Express — Express behind proxies
    url: https://expressjs.com/en/guide/behind-proxies.html
  - title: OWASP Node.js Security Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
  - title: OWASP Top 10
    url: https://owasp.org/www-project-top-ten/
  - title: Helmet documentation
    url: https://helmetjs.github.io/
  - title: npm audit documentation
    url: https://docs.npmjs.com/cli/commands/npm-audit
  - title: Node.js security best practices
    url: https://nodejs.org/en/learn/getting-started/security-best-practices
---

Security work before a launch is mostly about removing easy wins for an attacker: a leaked key, an unpatched dependency, a login form that accepts a million guesses, an error page that prints a stack trace. None of the steps below make an application perfectly secure. Together they make it a much harder target, and they make problems easier to notice and recover from.

## Start with a threat model

Spend ten minutes writing down three things before changing code:

1. **What is valuable?** User accounts, personal data, payment details, API keys, your server itself.
2. **Who can reach it?** Anonymous visitors, signed-in users, administrators, other services.
3. **What would hurt most?** Data exposed, data lost, the service down, your server used to attack others.

This list decides which items below matter most. A static portfolio and an app that stores customer records do not need the same effort.

## 1. Keep secrets out of code and logs

- Load secrets from environment variables or a secrets manager, never from files committed to Git.
- Give each environment its own keys, so a leaked development key cannot touch production.
- If a secret was ever committed, rotate it. Removing it in a later commit does not remove it from history.
- Never log request bodies, tokens, passwords, or full headers. Log identifiers and outcomes instead.

## 2. Use HTTPS everywhere

Serve the app only over HTTPS and redirect plain HTTP. Usually TLS ends at a reverse proxy such as Nginx or at a tunnel or CDN in front of the server; [PM2 and Nginx Explained](/blog/pm2-nginx-nodejs-production) shows the Nginx side. Once HTTPS works on every subdomain you use, the `Strict-Transport-Security` header tells browsers to refuse plain HTTP for your site.

## 3. Trust only the proxy you actually have

Behind a proxy, Express sees every request coming from the proxy's address unless you configure `trust proxy`. Configure it narrowly:

```js
// Nginx on the same machine
app.set('trust proxy', 'loopback');
```

The Express documentation warns that `true` trusts whatever the client sends in `X-Forwarded-For` unless the last proxy overwrites it. With the wrong setting, a visitor can choose their own IP address, which defeats IP-based rate limits and corrupts audit logs. In the test for this guide, `loopback` correctly accepted the forwarded address only because the request came from the local proxy.

Count the hops honestly. If traffic passes through two proxies (for example a tunnel and then Nginx), a setting that trusts only one will record every visitor with the same address.

## 4. Set security headers

Helmet sets a sensible default set of headers, including `Content-Security-Policy` and `Strict-Transport-Security`, and removes `X-Powered-By`:

```js
const express = require('express');
const helmet = require('helmet');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
```

The default Content Security Policy blocks inline scripts and scripts from other origins. That is the point, but it will break pages that rely on them. Test every page after enabling it, and allow specific sources rather than turning the policy off.

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
- Cap request body size, for example `express.json({ limit: '100kb' })`.

## 7. Handle sessions and authentication carefully

- Hash passwords with a slow, salted algorithm such as Argon2id or bcrypt. Never store them reversibly.
- Set session cookies with `HttpOnly`, `Secure`, and `SameSite`, and give them a generic name rather than the library default.
- Regenerate the session identifier after sign-in to prevent session fixation.
- Protect state-changing forms against cross-site request forgery with tokens or `SameSite` cookies plus origin checks.

## 8. Run with the least privilege

- Run the Node.js process as an ordinary user, never as `root`.
- Expose only the ports that must be public (usually 80, 443, and SSH). The app's own port should listen on `127.0.0.1` or be blocked by the firewall.
- Give database users only the permissions the app needs.

## 9. Keep dependencies current

Check installed dependencies against known advisories:

```sh
npm audit --omit=dev
```

`--omit=dev` limits the report to what runs in production. Review each finding: not every advisory affects how you use a package, but "high" and "critical" findings in reachable code deserve a fix before launch. Install from the lockfile on the server with `npm ci --omit=dev`, so production runs exactly the versions you audited.

Stay on a supported Node.js release line; unsupported versions stop receiving security fixes.

## 10. Log, monitor, and fail safely

- Return generic error messages to users and keep stack traces in server logs. In Express, set `NODE_ENV=production` and add your own error handler.
- Record security-relevant events (sign-ins, permission changes, admin actions) with who, what, and when.
- Watch for the app going down: an external uptime check on a health endpoint costs little and tells you before users do.

## 11. Prove you can restore

A backup you have never restored is a hope, not a backup.

- Back up the database and any uploaded files on a schedule, and keep at least one copy off the server.
- Restore a backup into a separate environment at least once and check the data.
- Write down the steps, so recovery does not depend on one person's memory.

## A pre-launch checklist

- [ ] No secrets in Git; production keys differ from development keys
- [ ] HTTPS only, with HTTP redirected
- [ ] `trust proxy` matches the real proxy chain
- [ ] Helmet enabled and pages tested with its Content Security Policy
- [ ] Rate limits on authentication and costly endpoints
- [ ] Input validated, output escaped, queries parameterized, body size capped
- [ ] Passwords hashed; session cookies `HttpOnly`, `Secure`, `SameSite`
- [ ] App runs as a non-root user; only needed ports open
- [ ] `npm audit --omit=dev` reviewed; supported Node.js version
- [ ] Generic error pages; security events logged; uptime monitored
- [ ] Backups taken and a restore tested

## Limitations

This checklist covers common web application risks. It is not a penetration test, and it does not cover every framework, cloud service, or compliance requirement. For applications that handle sensitive personal or payment data, get an independent security review.

## Related guides

- [How to Deploy a Node.js Application: A Beginner's Step-by-Step Guide](/blog/how-to-deploy-nodejs-app)
- [How to Host a Website on an Old Laptop Using Ubuntu](/blog/host-website-old-laptop-ubuntu)
- [PM2 and Nginx Explained: Running Node.js Applications in Production](/blog/pm2-nginx-nodejs-production)
