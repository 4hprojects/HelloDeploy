# Workflows

## Registration and Activation

1. User submits name, email, and password with a valid Turnstile token.
2. System validates input, checks uniqueness, hashes password, and creates a pending-verification account.
3. Resend sends a single-use verification link.
4. User verifies email.
5. Account becomes active and receives the platform role `USER`.
6. Login creates a revocable secure session.

Controls:

- Rate-limit registration and resend attempts.
- Verification tokens are hashed, single-use, and expire.
- Do not disclose whether an email exists during password recovery.

## Website Creation (guided setup)

The default path. Steps 2 onward are resolved from persisted project state, so the
flow resumes at the same step after a refresh, a new tab, or a return on another
device. Nothing about progress lives in the session.

1. User chooses a source. GitHub only; upload and starter templates are declared but
   unavailable.
2. User picks a repository from the installation's own listing, which is the sole
   authority on what the account may connect. Branch defaults to the repository's
   default and is editable under advanced options.
3. System creates the project on selection, named from the repository, and reserves
   the slug. Creating it here rather than earlier means an abandoned flow leaves no
   placeholder project and burns no slug.
4. System resolves the exact commit and runs framework detection immediately.
   Detection records per-field confidence; a detection failure does not strand the
   project, which already has its source.
5. User reviews analysis. High and medium confidence pass through; low confidence
   requires explicit confirmation, recorded in `project.setup.confirmedSteps`.
6. User confirms or edits the website name and platform address. Availability is
   checked against reserved names, existing subdomains and existing slugs, using the
   same rules the worker enforces at routing time.
7. User supplies required settings, derived from the project's own `.env.example`.
   Platform-managed names are refused in Simple mode.
8. System assesses readiness. Every blocking check carries an action pointing at the
   field that fixes it. The result is persisted for diagnosis.
9. Project remains a draft until approval is requested. The readiness step surfaces
   that gate rather than leaving it on a separate page.

### Manual creation

`/projects/new/manual` creates a name-only draft. Retained because it is the only
path that supports a public Git URL, which guided setup does not cover.

## Initial Approval

1. Owner submits project for review.
2. Validator checks repository access, supported runtime, package scripts, port rules, secret exposure indicators, repository size, and requested quotas.
3. Admin reviews findings and application purpose.
4. Admin approves or requests changes with an owner-visible note.
5. Approved project receives a configuration version and may deploy.

## Manual Deployment

1. Owner or Maintainer selects deploy latest, selected commit, redeploy, or no-cache deploy.
2. API verifies permission, approval, quota, monthly allowance, and queue state.
3. API creates a durable deployment record and queues a job.
4. Worker locks the project and fetches the exact commit.
5. Worker reruns repository and configuration validation.
6. Worker creates a controlled build context.
7. Worker builds an image under time and resource limits.
8. Worker starts a candidate container.
9. Health checks run.
10. Nginx route switches atomically.
11. Public verification runs through the configured hostname.
12. Deployment becomes successful and the previous release enters the retention window.
13. Resend sends success or failure notification according to user settings.

## Automatic Deployment

1. An authorized GitHub App source sends a signed push webhook; Public Git sources cannot enable Automatic mode.
2. API verifies signature, installation, repository, and delivery uniqueness.
3. If the push is not for the production branch, record it without deployment.
4. If automatic deployment is disabled, update the available-commit indicator.
5. If configuration-sensitive files changed, pause for review.
6. Otherwise create and queue a deployment.

High-risk file changes include:

- `Dockerfile` and Dockerfile variants
- Infrastructure manifests
- Platform-specific deployment configuration

## Deployment Progress Reporting

1. Worker records a `DeploymentStage` at each real boundary of a release:
   PREPARING, BUILDING, CONFIGURING, STARTING, CHECKING, PUBLISHING.
2. Install and build are one stage. Both run inside a single `docker build`;
   reporting them separately would mean parsing build output.
3. Each transition is persisted and published on the existing Redis channel, so the
   browser advances without a reload and a reader who arrives later sees the same
   picture from the record alone.
4. A terminal status closes the open stage. Cancellation sets the status directly and
   does not close it, so a lingering open stage on a finished deployment is reported
   as "did not finish" rather than as work in progress.
5. Stages never reached stay absent rather than being marked skipped.

## Failed Deployment

1. Worker records the failing stage and safe diagnostic output.
2. Candidate container and temporary route are removed.
3. Previous active release remains untouched.
4. Deployment status becomes failed.
5. Owner and Maintainers receive a useful error classification.
6. Retry is manual unless failure is classified as transient and retry policy permits it.

## Rollback

1. Authorized member chooses a retained healthy release.
2. System confirms its image is available and configuration is compatible.
3. Candidate container starts from the retained image.
4. Health checks pass.
5. Route switches atomically.
6. Rollback is recorded as a new deployment event referencing the source release.

## Custom Domain

1. Owner enters a domain.
2. System normalizes and checks that it is not already claimed.
3. System provides DNS instructions and a verification value.
4. Owner configures DNS.
5. System starts a uniquely identified ownership-verification attempt and checks the TXT record.
6. If the project has a healthy active deployment, system atomically activates the custom route; otherwise the domain waits in the verified state for the next healthy deployment.
7. Each deployment atomically moves the platform route and all active or verified custom-domain routes to the candidate before retiring the prior container.
8. System marks the domain active only after Nginx validates and reloads successfully. Legacy records already awaiting administrator approval retain that approval path.

## Environment Variable Change

1. Owner submits changed values through a protected form.
2. API encrypts values before persistence.
3. Audit log records names and actor, never values.
4. Project configuration version increments.
5. User is informed that a redeployment or restart is required.
6. Existing release remains unchanged until an authorized action occurs.

## Suspension

1. Admin selects reason and duration.
2. System records the audit event.
3. Active container is stopped.
4. Nginx serves a neutral suspension page without disclosing private reasons.
5. Deployments and domain changes are blocked.
6. Owner is notified.
7. Reactivation requires authorized review.

## Queue and Capacity

1. API checks server admission rules before queueing.
2. Queue limits concurrent builds, initially to one.
3. Runtime applications remain prioritized over builds.
4. Super Admin may pause new builds.
5. A job exceeding its timeout is terminated and cleaned.

## Inactivity

1. Scheduled job calculates meaningful activity.
2. At 60 days, notify Owner.
3. At 90 days, flag for administrative suspension.
4. No automatic deletion occurs.
