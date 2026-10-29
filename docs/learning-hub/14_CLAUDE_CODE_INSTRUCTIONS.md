# Claude Code Operating Instructions

Read `00_MASTER_PLAN.md` and `01_REPOSITORY_AUDIT.md` first. Audit repo, run `git status`, identify conventions and produce Phase 0 report. **Stop and request review after Phase 0**. No code changes during audit. If owner later approves implementation, read each phase-specific spec plus cross-cutting testing, deployment and tracking instructions before working.

## Autonomous decisions

Select best normal engineering option on evidence and document why. Do not interrupt for small implementation choices. Prefer existing dependencies and services, no unnecessary new infrastructure. If specs conflict with actual code, document adjustment and safer choice. If paid service, externally consequential public enable, secret, destructive migration, production deployment or merge needed, stop for owner authorization. Never bypass moderation to meet schedule.

## Per-phase loop

Create phase-scoped implementation, add tests, run repository checks, update docs and phase tracker, commit on feature branch if allowed, report file changes/results/risk/gaps. Continue to next authorized phase automatically only when gates pass. If blocked, isolate blocker and work on safe independent tasks when permitted, report transparently. Don't claim tests ran without actual logs.

## Nonnegotiables

- Markdown source and EJS reuse unless Phase 0 evidence justifies different compatible design.
- Guest comments auto-publish only on safe automated decision; no manual approval; 1 visual reply depth; no login requirement.
- Turnstile server-side validation + anti-abuse fail-closed mandatory. Cloudflare validation is not content moderation.
- Public UI remains functional on commenting/provider outages.
- Ads and comments disabled by default until owner authorizes activation; do not equate technical AdSense readiness with approval.
- Never leak API tokens, raw commenter personal info or private server configuration in reports or logs.
- Cite factual claims and record verification for five articles.
- Preserve deployment operations and current auth architecture.

## Deliverable

A reviewable branch/PR with testable implementation, five editorial drafts, audit and phase reports, operational instructions and clear list of features still off by default.
