# Render.com Feature Comparison

Compared 2026-09-22 against Render's public documentation.

## Scope and boundary

This is a study, not a roadmap. Per
[Platform Architecture](PLATFORM_ARCHITECTURE.md), HelloDeploy "is not a dashboard layered over
another application-hosting provider, and it does not submit deployments to Render, Vercel,
Coolify, or another PaaS. Commercial hosting dashboards **may be studied as interaction
references**, but their infrastructure, product model, terminology, and capabilities are not
HelloDeploy dependencies."

Ten Render-shaped capabilities were already evaluated and deferred in
[Project Settings Deferred Capability Evaluations](PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md), each
behind an ADR. This document does **not** re-argue any of them. It records parity and moves on.

**Headline:** core parity is good. The deploy pipeline holds up well. Where HelloDeploy falls short
is day-two operations — knowing what is running, and what happens after a release goes healthy.

## Parity table

| Render capability                  | HelloDeploy                                 | Disposition       |
| ---------------------------------- | ------------------------------------------- | ----------------- |
| Git-triggered deploys              | GitHub App + public git URL                 | parity            |
| Docker build from source           | Generated Dockerfile, sanitized context     | parity            |
| Framework detection                | Static, React, Vue, Express, Node, Next.js  | parity            |
| Zero-downtime release              | Health check → nginx swap → retire previous | parity            |
| Health check at deploy             | Accepts `< 400`, matching Render's 2xx/3xx  | parity            |
| Rollback to a previous release     | Retained-image rollback, last 3 releases    | parity            |
| Monorepo build filters             | Build path include/exclude globs            | parity            |
| Auto-deploy on push                | Webhook, `AUTOMATIC` deployment mode        | parity            |
| Deploy hooks (external trigger)    | Per-project token endpoint                  | parity            |
| Custom domains                     | DNS TXT verification + admin approval       | parity            |
| Environment variables              | Encrypted at rest, versioned, rotatable     | **ahead**         |
| Commit-message deploy skip         | `[skip deploy]` — added 2026-09-22          | closed            |
| Restart / redeploy current release | Redeploy Live Commit — added 2026-09-22     | closed            |
| Configurable stop grace            | `CONTAINER_STOP_GRACE_SECONDS` — added      | closed            |
| Continuous health checks           | None after the release completes            | **act on**        |
| Runtime application logs           | Deploy logs only; `docker logs` not exposed | **act on** TB-127 |
| Deploy only after CI passes        | No such deployment mode                     | **act on**        |
| Secret files on disk               | Env vars only                               | act on, low       |
| Shared environment groups          | Per-project secrets only                    | low value here    |
| REST API                           | Webhooks and deploy hooks only              | known gap         |
| Managed Postgres / Redis           | Not offered                                 | out of scope      |
| Background workers                 | Not offered                                 | out of scope      |
| IaC blueprints (`render.yaml`)     | Not offered                                 | out of scope      |

## Deliberate gaps — settled, not revisited

Render has all of these. Each was evaluated and deferred with a stated reason and prerequisite in
[PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md](PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md). Listed here
only so their absence is not mistaken for an oversight.

Pull-request previews · edge caching / CDN · region selection · user-selectable instance sizing ·
interactive shell access · horizontal or manual scaling · persistent disks · one-off jobs · custom
maintenance-page URL · advanced networking controls.

One observation worth recording without reopening anything: Render's preview environments copy the
base service's environment variables **including database credentials**, and their own documentation
warns users to change them. That is a concrete argument _for_ the existing deferral, not against it.

## Practices adopted 2026-09-22

Four gaps were closed. Each was a case where HelloDeploy left a user to guess at something Render
states plainly.

1. **Redeploy the live commit.** There was no way to restart the running release without also
   picking up whatever had landed on the branch since. Render documents "Restart service" as the
   answer to "I changed an environment variable"; HelloDeploy had no equivalent, so the only route
   was a deploy of a different commit than the user intended.
2. **Say when a secret change has not shipped.** Secrets reach a container only at start, so editing
   one changed nothing about the live release and reported nothing. Render forces the choice
   explicitly — save only, save and deploy, or save and rebuild. All four write paths now point at
   the redeploy action. Deliberately not automatic: silently restarting a live application is not a
   reasonable side effect of saving a form.
3. **Commit-message deploy skip.** Build path filters existed; `[skip deploy]` did not.
4. **Configurable container stop grace,** defaulting to 30s rather than a hardcoded 15s. An
   application still draining requests was cut off mid-flight.

## Practices already in place

Worth asserting rather than building:

- **Correlation ID on every request.** Render mandates logging the `CF-Ray` header so a request can
  be traced end to end. HelloDeploy's `correlation-id` middleware already does this.
- **External uptime probing** and **a tested restore procedure** are Render's top two documented
  reliability recommendations. Both are already tracked, as TB-047 and TB-040. Render's guidance is
  corroboration, not new work.

## Recommended backlog additions

Written in the existing `TB-###` idiom for appending to [Task Backlog](TASK_BACKLOG.md).

| ID     | Task                                                                                                                                                                                                                                                                                                                          | Pri | Effort |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TB-150 | **Continuous health checking.** The largest remaining reliability gap. HelloDeploy checks health once during a release and never again, so an application that dies afterwards stays HEALTHY in the dashboard. Render probes continuously: roughly 15s of consecutive failures stops routing to an instance, 60s restarts it. | P1  | M      |
| TB-151 | Add a `CI_PASSED` deployment mode that waits for GitHub check runs to succeed before deploying. Render offers this as a first-class auto-deploy option; it prevents shipping a commit that CI is about to fail. Needs the GitHub check-runs API.                                                                              | P2  | M      |
| TB-152 | Offer a choice of overlapping-deploy policy. HelloDeploy rejects a second deployment outright; Render lets the owner pick queue-behind or cancel-and-replace.                                                                                                                                                                 | P3  | S      |
| TB-153 | Support secret files mounted on disk for applications that read credentials from a path rather than the environment (service-account JSON, certificates).                                                                                                                                                                     | P3  | M      |
| TB-154 | Document client-side retry for WebSocket consumers in the user guide. Any release replaces the container and drops long-lived connections; Render documents this as an application responsibility. Relevant now that the nginx WebSocket upgrade map has shipped.                                                             | P3  | S      |

**TB-150 interacts with a decision already taken.** TB-070 shipped as detection only — the
reconciliation sweep records container drift and warns, but does not restart. That was the right
call without real data. Render's model is evidence that bounded automatic restart is standard
practice, and worth revisiting once the pilot produces actual reboot and crash-loop numbers. It is
not a reason to reverse the decision now.

## Sources

- [Deploys](https://render.com/docs/deploys)
- [Health checks](https://render.com/docs/health-checks)
- [Environment variables](https://render.com/docs/configure-environment-variables)
- [Service previews](https://render.com/docs/service-previews)
- [Uptime best practices](https://render.com/docs/uptime-best-practices)
- [Static sites](https://render.com/docs/static-sites)
- [Scaling](https://render.com/docs/scaling)
- [Projects and environments](https://render.com/docs/projects)
