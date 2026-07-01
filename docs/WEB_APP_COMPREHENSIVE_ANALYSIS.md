# HelloDeploy Web App Comprehensive Analysis

Date: 2026-07-02
Scope: `apps/web`, shared packages used by the web app, routing, middleware, controllers, services, EJS views, public CSS, and the existing automated test suite.

This review focused on three dimensions:

- Efficiency: request flow, database/query patterns, asset loading, long-lived connections, and operational performance.
- User friendliness: navigation, feedback, accessibility, responsive behavior, and task clarity.
- Security: authentication, authorization, CSRF, session handling, secrets, deployment/domain operations, webhooks, logging, and platform hardening.

## Executive Summary

HelloDeploy has a solid foundation for a self-hosted deployment platform. The app uses a straightforward Express/EJS architecture, Mongo-backed sessions, CSRF protection, Helmet headers, rate limits, role-based routes, encrypted environment secrets, HMAC-verified GitHub webhooks, redacted deployment logs, and a broad automated test suite.

The most important issue found is a cross-project authorization gap in several mutation flows. Some routes authorize the current `:slug` project, then perform actions on a `deploymentId` or `domainId` without verifying that the object belongs to that same project. This can allow a member of one project to cancel/retry another project's deployment or verify/remove another project's domain if they know the target ID.

Remediation status:

- 2026-07-02: P0 deployment/domain cross-project mutation issues were remediated by scoping cancel/retry and verify/remove service queries to the authorized project ID. Regression tests were added and local quality gates passed.
- 2026-07-02: CSP blockers were inventoried. Follow-up implementation should externalize shared scripts, remove inline handlers, remove repository `innerHTML` option resets, and introduce nonce/report-only CSP before enforcement.

Automated checks:

- `npm test`: passed, 462 tests, 0 failures.
- `npm run lint`: failed on one existing lint issue in `tests/deployment/live-progress-sse.test.js` (`no-regex-spaces`).

## Priority Findings

### P0 - Cross-Project Deployment Mutations

Evidence:

- `apps/web/src/controllers/deployment.controller.js` authorizes the route through `requireProjectRole(...)`, but `postCancelDeployment` and `postRetryDeployment` pass only `deploymentId` and `actorId` to the service.
- `apps/web/src/services/deployment.service.js` loads deployments by `_id` only in `cancelDeployment()` and `retryDeployment()`.
- Unlike rollback, these paths do not compare the deployment's `projectId` to the current route project's `_id`.

Impact:

A user with owner or maintainer access to any project could submit a crafted request under their own project slug using another project's deployment ID. If the target deployment is active, they could cancel it. If it is failed/cancelled, they could retry it and enqueue work for a project they do not belong to.

Recommended fix:

- Change `cancelDeployment` and `retryDeployment` to accept `projectId`.
- Query using both IDs: `{ _id: deploymentId, projectId }`.
- Return a generic not-found response when the deployment does not belong to the current project.
- Add tests proving members of Project A cannot cancel or retry Project B deployments.

### P0 - Cross-Project Domain Verification/Removal

Evidence:

- `apps/web/src/controllers/domain.controller.js` authorizes the current project slug, then calls `requestVerification(domainId, ...)` and `removeDomain(domainId, ...)`.
- `apps/web/src/services/domain.service.js` loads domains by `_id` only.
- The services enqueue jobs and update status using the domain's stored `projectId`, not the route project's authorized ID.

Impact:

A project owner could verify or remove another project's custom domain if they know its `domainId`. For active domains, removal can enqueue route cleanup for the victim project.

Recommended fix:

- Change `requestVerification` and `removeDomain` to accept `projectId`.
- Query with `{ _id: domainId, projectId }`.
- Add tests for cross-project domain isolation.
- Consider applying the same ownership pattern to all project-owned resource mutations.

### P1 - Content Security Policy Is Disabled

Evidence:

- `apps/web/src/app.js` uses `helmet({ contentSecurityPolicy: false })`.
- The code comments state this is because inline scripts are used across templates.

Impact:

EJS escapes normal interpolations, and log rendering avoids `innerHTML`, which reduces XSS risk. However, without CSP, any future template injection or unsafe script sink has a much larger blast radius. This is especially relevant because the app handles deployment logs, repository metadata, custom domains, and user-provided project data.

Recommended fix:

- Move inline scripts into static JS assets where practical.
- For unavoidable inline bootstraps, add per-request nonces and configure Helmet CSP with `script-src 'self' 'nonce-...'`.
- Include `connect-src` entries for EventSource log streaming and any external services such as Turnstile.

### P1 - Service Layer Relies Heavily on Caller-Enforced Authorization

Evidence:

- Project services generally assume route middleware already verified the actor's rights.
- The cross-project deployment/domain issues are examples of this pattern becoming unsafe when object IDs are accepted from params.

Impact:

The current HTML routes mostly enforce roles correctly, but future API routes, jobs, or refactors can accidentally reuse services without authorization checks.

Recommended fix:

- Add explicit project ownership constraints inside services that mutate project-owned resources.
- Use service method names/signatures that force scope, such as `cancelProjectDeployment({ projectId, deploymentId, actorId })`.
- Prefer "not found" for both nonexistent and out-of-scope objects.

### P2 - Rate Limit Redis Fallback Can Weaken Production Controls

Evidence:

- `apps/web/src/middleware/rate-limit.js` falls back to the default in-memory store if Redis setup fails.

Impact:

In production, in-memory rate limits are per-process and reset on restart. With multiple web processes, brute-force protection becomes inconsistent.

Recommended fix:

- In production, fail startup or emit a hard health-check failure when Redis-backed rate limiting is unavailable.
- Keep memory fallback only for development/test.

### P2 - Lint Fails Despite Passing Tests

Evidence:

- `npm run lint` fails on `tests/deployment/live-progress-sse.test.js:38:40` with `no-regex-spaces`.

Impact:

CI or preflight quality gates can fail even when the functional test suite passes.

Recommended fix:

- Replace the literal repeated spaces in that regex with `{6}` or run `eslint --fix` for that file.

## Security Assessment

### Strengths

- Session cookies are `httpOnly`, `sameSite: 'strict'`, secure in production, and rolling with a 24-hour TTL.
- Successful sign-in regenerates the session ID, reducing session fixation risk.
- CSRF protection covers mutating routes and supports both form fields and `X-CSRF-Token`.
- GitHub webhook routes are registered before body parsing and CSRF, preserving raw bodies for signature verification.
- Authentication uses generic login failures and a dummy password hash for unknown emails.
- Passwords are hashed with Argon2.
- Email verification tokens and password reset codes are stored as hashes, not plaintext.
- Environment secrets are encrypted and only secret names are listed in the UI.
- Deployment log handling stores and streams redacted messages.
- Domain normalization blocks localhost, platform domains, raw IPs, and malformed hostnames.
- Existing tests cover CSRF, authorization, session fixation, webhook signatures/replay, redaction, command injection, path traversal, and container hardening.

### Security Gaps and Recommendations

- Fix the P0 cross-project deployment and domain mutation paths first.
- Enable CSP with nonce support.
- Move authorization constraints deeper into project-owned service methods.
- Make production Redis/rate-limit failures explicit instead of silently degrading.
- Consider adding HSTS configuration explicitly through Helmet for production if not already handled by the reverse proxy.
- Review `trust proxy = 1` against the exact deployment topology. It is appropriate behind one trusted proxy, but misconfiguration can affect IP-based rate limiting and secure-cookie behavior.
- Add tests for every mutation that accepts both `:slug` and another object ID, including deployment events, secrets, repository disconnects, domain approval, and member role changes.

## Efficiency Assessment

### Strengths

- Static assets are served before the general rate limiter, avoiding wasted limiter work on CSS/images.
- Request body limits are set to `1mb`, reducing accidental large payload handling.
- Project deployment lists are paginated.
- Dashboard/admin overview paths use `Promise.all` where independent data can be collected concurrently.
- Deployment log SSE sends existing events and then polls incrementally by `_id`, limiting repeated payloads.
- Queue operations use job IDs for deduplication.

### Efficiency Risks

- SSE uses per-connection polling every 1.5 seconds. This is acceptable at low scale but can create database load with many active viewers.
- `getUserProjects()` populates all memberships for a user and sorts in memory. This is fine for small quotas, but should be paginated or sorted in the database if project counts grow.
- Several screens perform count plus page queries separately. This is common, but high-cardinality admin pages may need indexes and/or cached counts.
- Inline scripts in templates limit browser caching benefits and block CSP rollout.

### Efficiency Recommendations

- Keep the current SSE approach for pilot scale, but add a cap on simultaneous streams per user/IP and monitor query volume.
- Add or verify Mongo indexes for high-traffic filters: `ProjectMembership.userId`, `ProjectMembership.projectId`, `Deployment.projectId + sequenceNumber`, `Domain.hostnameNormalized`, `AuditEvent.createdAt/action/outcome`, and session TTL.
- Move shared inline JavaScript to static files so browsers can cache it.
- Consider conditional `Cache-Control` headers for static assets if not already handled upstream.

## User-Friendliness Assessment

### Strengths

- The app has a clear operational layout: dashboard, projects, deployments, environment, domains, members, and admin sections.
- Destructive actions use a shared confirmation modal instead of native browser confirms.
- Forms include CSRF partials and pending states to reduce duplicate submissions.
- UI tests cover accessibility, tooltips, mobile sidebar behavior, responsive tables, guided empty states, theme persistence, and icon consistency.
- Error pages avoid exposing internal details.
- Empty states guide users through repository connection, detection, secrets, and deployment setup.
- The UI supports light/dark themes and reduced-motion preferences.

### Usability Risks

- Some service-layer failures are surfaced as generic flash messages. For operational workflows, users may need clearer remediation steps, especially for queue unavailable, repository access inactive, DNS not propagated, and deployment already in progress.
- Project/member/domain IDs in URLs are opaque where secondary resources are involved. This is normal, but it makes authorization bugs harder for users/admins to reason about.
- A 6-minute SSE timeout may surprise users watching long builds unless the UI clearly marks the stream as timed out while the deployment continues.
- Admin pages with large audit/project/user lists may become harder to scan without richer filters or saved views.

### User-Friendliness Recommendations

- Add targeted recovery copy for common deployment/domain failures.
- On log stream timeout, provide a visible reconnect control or automatic reconnect status.
- Add admin filters for project owner, repository status, deployment mode, and last activity.
- Keep table responsiveness, but consider denser desktop admin tables for repeated operational use.

## Validation Results

Command results from this review:

```text
npm test
Result: passed
Tests: 462 passed, 0 failed
```

```text
npm run lint
Result: failed
Issue: tests/deployment/live-progress-sse.test.js:38:40 no-regex-spaces
```

## Recommended Remediation Order

1. Fix cross-project deployment cancel/retry authorization.
2. Fix cross-project domain verify/remove authorization.
3. Add regression tests for project-owned object ID isolation.
4. Fix the lint error so quality gates are green.
5. Enable CSP using nonces and externalized scripts.
6. Harden production rate-limit behavior when Redis is unavailable.
7. Add performance indexes and monitor SSE query load.
8. Improve operational error copy and reconnect behavior for long-running log streams.

## Overall Rating

Security: needs immediate P0 fixes before production multi-tenant use.

Efficiency: good for pilot/self-hosted scale, with predictable scaling pressure around SSE polling, admin list queries, and Redis-backed rate limits.

User friendliness: strong baseline for an operational deployment tool, with good accessibility and responsive coverage already represented in tests.
