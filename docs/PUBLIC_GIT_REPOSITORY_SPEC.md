# Public Git Repository Connection Specification

Updated: 2026-07-14T14:41:55+08:00

Status: **Implemented in the repository — live worker deployment validation pending**

## Purpose

This specification defines an intuitive repository workflow for users who want to deploy a public GitHub repository by pasting its HTTPS URL without installing the HelloDeploy GitHub App. It extends, rather than replaces, the existing GitHub App workflow.

The initial implementation must preserve HelloDeploy's self-hosted architecture and security boundaries: the web process validates and records source metadata, the worker performs Git operations and builds, and only authorized project roles can change a project's source.

Reference hosting products expose both a connected-provider path and a public-repository URL path. This document adapts that interaction pattern to HelloDeploy without claiming full feature parity or changing the current production-readiness decision.

## Baseline Behavior and User-Experience Gap

Before this implementation, `/projects/:slug/repository` supported only GitHub App repositories:

1. The project Owner installs or authorizes the HelloDeploy GitHub App.
2. HelloDeploy lists repositories granted to that installation.
3. The Owner selects a repository and production branch.
4. The web application verifies access and stores GitHub installation and repository identifiers.
5. Detection reads selected files through the authenticated GitHub API.
6. A deployment job obtains a short-lived installation token and the worker clones the exact commit.

This is the correct secure workflow for private repositories and automatic deployment, but it makes a public repository unnecessarily difficult to connect. A user reasonably expects to paste a public GitHub URL, select a branch, run detection, and deploy manually.

The implementation therefore changed the complete source path rather than only changing the form:

- Repository source metadata now distinguishes `GITHUB_APP` from `PUBLIC_GIT` and conditionally validates installation identifiers.
- Public repository and branch inspection uses bounded, redirect-denying GitHub public API requests.
- Detection reads public source files without requesting an installation token.
- The worker reconstructs a canonical credential-free URL and clones the persisted exact commit with ambient credential helpers disabled.
- Automatic deployment remains restricted to signed GitHub App webhooks.

## Product Decision

HelloDeploy will support two explicit source connection modes.

| Source mode               | User input                               | Authorization                 | Deployment modes    | Initial provider support |
| ------------------------- | ---------------------------------------- | ----------------------------- | ------------------- | ------------------------ |
| GitHub App (`GITHUB_APP`) | Authorized repository and branch chooser | GitHub App installation token | Manual or Automatic | GitHub                   |
| Public Git (`PUBLIC_GIT`) | Public HTTPS repository URL and branch   | No repository credential      | Manual only         | GitHub                   |

Public Git is a source-access mode, not anonymous access to HelloDeploy. The user must still sign in, own the project, pass project approval and quota checks, and use the normal deployment queue.

### Why Automatic Deployment Is Excluded

A pasted public URL does not grant a signed webhook relationship. The initial implementation must not poll repositories, accept unsigned provider events, or silently treat public availability as webhook authorization.

When `sourceType` is `PUBLIC_GIT`:

- New projects default to Manual deployment.
- The Automatic option is absent or disabled with explanatory text.
- Direct attempts to set Automatic are rejected server-side.
- Replacing a GitHub App source with Public Git changes an Automatic project to Manual in the same audited transaction and requires explicit confirmation.

## Scope

### Included

- Public GitHub repositories addressed by canonical HTTPS URL.
- Repository URL parsing, normalization, and public-access verification.
- Public branch discovery and exact commit resolution.
- Runtime detection without a GitHub App installation.
- Manual, selected-commit, retry, redeploy, and rollback workflows where otherwise permitted.
- Existing project approval, quota, build, container, routing, log, notification, and audit behavior.
- Backward-compatible migration of existing GitHub App repository records.
- Desktop, mobile, keyboard, screen-reader, validation, authorization, and failure states.

### Excluded From the Initial Delivery

- Private repositories without a GitHub App.
- GitHub personal access tokens, deploy keys, passwords, or credentials embedded in URLs.
- SSH, `git://`, `file://`, local filesystem, IP-literal, or arbitrary-host repository URLs.
- GitLab, Bitbucket, self-hosted Git servers, or provider discovery by redirects.
- Automatic deployment, polling, or pull-request previews for Public Git sources.
- Git submodule initialization, Git LFS credential support, or recursive dependency access.
- Multiple repositories per project.
- A generic arbitrary Git proxy or outbound network configuration UI.

These exclusions prevent a small usability feature from becoming a credential-management, SSRF, or multi-provider integration project.

## Repository Page Experience

### Entry State

When no repository is connected, render one **Connect a repository** card with two source choices:

1. **Public Git repository** — recommended for public code and requires only a URL.
2. **Connect GitHub** — required for private repositories and automatic deployments.

The public option must remain available even when the platform GitHub App is not configured. GitHub App configuration affects only the connected-provider option.

### Public Repository Form

Fields:

- **Repository URL** — required; accepts the documented public GitHub HTTPS forms.
- **Production branch** — initially disabled; populated after the URL passes verification.

Actions and feedback:

1. User pastes a URL.
2. User selects **Check repository** or leaves the field after a complete value is present.
3. The page shows a bounded pending state and prevents duplicate checks.
4. HelloDeploy returns only normalized public metadata: `owner/repository`, default branch, and available branch names.
5. User selects a production branch.
6. User selects **Connect repository**.
7. The server repeats URL, visibility, and branch validation before persistence; client-side success is never trusted.
8. Success returns to the project Overview with the repository checklist row complete and **Run detection** as the next action.

The connection is not complete merely because a URL parses. It completes only after the server verifies that the repository is public and the selected branch resolves to a full commit SHA.

### Connected State

Display:

- Source type: `Public Git repository` or `GitHub App`.
- Normalized `owner/repository` identity.
- Public/private visibility.
- Production and default branches.
- Latest observed short commit SHA and safe first-line message.
- Connection/access status and last successful check.

For Public Git, show concise guidance:

> Manual deployments are available. Connect GitHub to enable private repository access and automatic deployment.

Do not present an installation ID, credential state, clone credential, raw API response, or stored URL containing query data.

### Replacement and Disconnection

- Repository changes remain Owner-only and are treated as review-sensitive configuration changes.
- Replacing a source requires a confirmation that identifies the normalized repository name and explains deployment-mode changes.
- Existing healthy releases remain available after disconnection or source replacement.
- Disconnection prevents new builds but does not delete deployment history, images, routes, or active releases.
- Replacement increments the project configuration version and invalidates stale detection results.

## URL Contract

### Accepted Initial Forms

```text
https://github.com/owner/repository
https://github.com/owner/repository.git
```

The canonical stored clone URL is derived by HelloDeploy:

```text
https://github.com/owner/repository.git
```

The user-provided string is never passed directly to Git, an HTTP client, a shell, or a log.

### Validation and Normalization

The parser must:

- Use the platform URL parser, not string splitting alone.
- Require `https:`.
- Require the exact normalized hostname `github.com`.
- Reject usernames, passwords, non-default ports, query strings, fragments, backslashes, encoded separators, control characters, and whitespace inside the URL.
- Reject IP literals and hosts that merely end in `github.com`.
- Require exactly two nonempty path segments: owner and repository.
- Remove one terminal `.git` suffix and reject an empty resulting repository name.
- Enforce conservative GitHub owner/repository character and length limits.
- Construct `fullName` and the canonical clone URL from validated components.
- Never follow a redirect to a different host during validation, discovery, or clone preparation.

Validation must return stable, user-actionable classifications such as:

- `INVALID_REPOSITORY_URL`
- `UNSUPPORTED_REPOSITORY_HOST`
- `REPOSITORY_NOT_FOUND`
- `REPOSITORY_NOT_PUBLIC`
- `REPOSITORY_RATE_LIMITED`
- `BRANCH_NOT_FOUND`
- `REPOSITORY_UNAVAILABLE`

Provider response bodies, network topology, and Git stderr remain out of user-facing errors.

## Data Model

Extend `repositories` without breaking existing records.

| Field                 | Proposed type/value                              | Rules                                                                  |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `sourceType`          | `GITHUB_APP \| PUBLIC_GIT`                       | Default/backfill existing records to `GITHUB_APP`                      |
| `provider`            | `GITHUB`                                         | Required; leaves room for later provider ADRs                          |
| `canonicalCloneUrl`   | Normalized HTTPS URL or `null`                   | Required only for `PUBLIC_GIT`; must never include credentials         |
| `installationId`      | Number or `null`                                 | Required only for `GITHUB_APP`                                         |
| `githubRepoId`        | Number or `null`                                 | Required for `GITHUB_APP`; optional public metadata for `PUBLIC_GIT`   |
| `nodeId`              | String or `null`                                 | Required for `GITHUB_APP`; optional for `PUBLIC_GIT`                   |
| `fullName`            | Normalized `owner/repository`                    | Required for both modes                                                |
| `name`, `ownerLogin`  | Normalized components                            | Required for both modes                                                |
| `visibility`          | `public \| private`                              | Must be `public` for `PUBLIC_GIT`                                      |
| `accessStatus`        | `ACTIVE \| REVOKED \| SUSPENDED \| INACCESSIBLE` | `INACCESSIBLE` covers a removed, renamed, or newly private public repo |
| `lastAccessCheckedAt` | Date or `null`                                   | Updated only after bounded successful/failed checks                    |

Conditional schema validation must reject impossible combinations, including:

- `PUBLIC_GIT` with private visibility.
- `PUBLIC_GIT` with credentials in `canonicalCloneUrl`.
- `GITHUB_APP` without installation and GitHub repository identifiers.
- Unknown source types or providers.

Indexes:

- Keep `projectId` lookup.
- Convert installation/repository indexes to partial indexes applying only to `GITHUB_APP` records.
- Add an index suitable for normalized public identity lookup without making public repositories globally unique across projects.

Migration behavior:

1. Deploy code that treats a missing `sourceType` as `GITHUB_APP` before any backfill.
2. Backfill existing repository records in bounded batches.
3. Add conditional validation and partial indexes only after compatibility is proven.
4. Do not rewrite, disconnect, or rotate existing GitHub App records.
5. Rollback code must continue reading backfilled records or the migration must define a reversible field/index step.

## Service and Controller Boundaries

### Source Adapter Contract

Introduce a small shared source abstraction rather than scattering `sourceType` checks:

```text
inspectRepository(source)
listBranches(source)
resolveCommit(source, branchOrSha)
fetchDetectionFiles(source, ref)
prepareClone(source, commitSha)
```

The GitHub App adapter retains installation-token behavior. The Public GitHub adapter uses only unauthenticated public operations and canonical values.

### Web Responsibilities

The web process may:

- Parse and normalize the submitted URL.
- Call bounded public GitHub metadata endpoints for repository, branch, commit, and detection-file reads.
- Apply per-user and per-IP rate limits and short-lived metadata caching.
- Persist only verified normalized metadata.
- Enqueue deployment jobs containing repository and exact commit identifiers.

The web process must not:

- Execute Git.
- access Docker or the Nginx helper.
- Probe arbitrary hosts.
- accept or store public-source credentials.
- trust hidden form metadata for repository identity, visibility, branch, or commit SHA.

Unauthenticated GitHub API limits are an operational constraint. Rate-limit exhaustion must produce a retryable bounded error, not trigger a fallback to arbitrary URL fetching or require the user to paste a token.

### Worker Responsibilities

The worker selects clone behavior from the persisted source type:

- `GITHUB_APP`: obtain a short-lived installation token and use the existing authenticated exact-commit clone.
- `PUBLIC_GIT`: reconstruct the canonical credential-free GitHub HTTPS URL and fetch the persisted exact commit.

Both paths must:

- Use argument arrays with `shell: false`.
- Set `GIT_TERMINAL_PROMPT=0`.
- Fetch and check out the exact 40-character commit SHA.
- Remove the remote and `.git` directory before build-context processing.
- Bound clone duration, output, repository size, and disk usage.
- Return classified errors without raw Git output or URLs containing credentials.
- Run existing build-context, symlink, dangerous-file, resource, and cleanup checks.

Public cloning must not add a credential placeholder, inherit a global credential helper, or send ambient Git credentials. The worker should use a controlled Git configuration environment that disables interactive and global credential lookup for this operation.

## Detection and Commit Semantics

- Connection resolves the selected branch to a full commit SHA and stores it as the latest observed commit.
- Detection runs against an explicit ref and records which commit produced the detection result.
- Manual **Deploy latest** resolves the production branch again and queues that exact SHA.
- Selected-commit deployment accepts only an exact validated SHA reachable from the public repository.
- Retry deploys the original exact SHA; it does not move to the latest branch head.
- If a public repository becomes private, is removed, or cannot serve the exact SHA, the candidate deployment fails without affecting the active release.
- A repository visibility or access failure changes `accessStatus` to `INACCESSIBLE` only after a classified provider response, not on a transient timeout.

## Authorization, CSRF, and Audit

- Repository connect, replace, and disconnect remain Owner-only.
- Maintainers may deploy an already connected source only under existing project rules.
- Viewers remain read-only.
- Every mutation requires authentication, project-role authorization, and CSRF protection.
- Connection and replacement revalidate project status and review requirements server-side.
- Audit events record source type, provider, normalized `fullName`, branch, outcome, and safe error classification.
- Audit events never include raw submitted URLs, query strings, API bodies, Git output, tokens, or credentials.
- Duplicate submissions must be idempotent or result in one effective repository/configuration update.

## Security Requirements

### SSRF and Network Boundaries

- The initial public adapter supports only exact `github.com` HTTPS URLs and GitHub's documented public API host used by server-owned code.
- No user-controlled scheme, host, port, redirect destination, proxy, DNS target, or clone option reaches a network client.
- URL validation happens before any network request.
- Redirects are disabled or revalidated against the same exact allowlist.
- Requests use bounded connect, response, and total timeouts with response-size limits.

### Git Argument and Configuration Safety

- Never invoke a shell or concatenate a Git command string.
- Reject values beginning with `-` where they might become arguments.
- Place `--` before path-like values where supported.
- Disable terminal prompts and ambient credential helpers.
- Do not log Git environment variables, remote configuration, stdout, or stderr verbatim.

### Repository and Build Safety

- Preserve exact-SHA cloning, workspace containment, safe cleanup, context-size limits, symlink rejection, generated Dockerfile policy, non-root containers, and resource limits.
- Treat all public repositories as untrusted code, including repositories owned by the current user.
- Public availability is not approval. Existing project review and high-risk-file checks remain authoritative.

## UX States and Recovery

| State                                   | User feedback                                                      | Recovery                                           |
| --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Empty                                   | Choose Public Git or Connect GitHub                                | Switch modes without losing unrelated project data |
| URL incomplete/invalid                  | Inline format or supported-host error                              | Correct in place; no network call or persistence   |
| Checking                                | Disabled duplicate action and announced pending state              | Timeout returns form with URL retained             |
| Public and reachable                    | Normalized identity, default branch, branch selector               | Select branch and connect                          |
| Private/not found                       | Generic unavailable-or-not-public guidance                         | Connect GitHub or correct URL                      |
| Provider rate limited                   | Retry-later message without provider body or infrastructure detail | Preserve URL; bounded retry                        |
| Branch disappeared before save          | Branch-specific inline error                                       | Refresh branch list                                |
| Connected                               | Source type, repository, branch, latest commit, next action        | Run detection                                      |
| Became inaccessible                     | Status and actionable Connect GitHub/replace/retry choices         | Active healthy release remains untouched           |
| Replacement changes Automatic to Manual | Confirmation explains mode change                                  | Cancel leaves source and deployment mode unchanged |

The tab/choice control, URL input, branch selector, errors, pending state, and confirmation must be usable with keyboard and screen reader. Focus moves to the error summary after failure and to the connected-source heading after success.

## API and Route Plan

Keep existing routes backward compatible while adding explicit source handling.

| Route                                        | Purpose                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| `GET /projects/:slug/repository`             | Render both source options and connected state              |
| `POST /projects/:slug/repository/inspect`    | Validate a public URL and return bounded branch metadata    |
| `POST /projects/:slug/repository`            | Connect a verified source using explicit `sourceType`       |
| `POST /projects/:slug/repository/disconnect` | Preserve existing audited disconnection behavior            |
| `GET /github/branches`                       | Retain existing GitHub App branch endpoint during migration |

The inspect endpoint is a mutation-like network action and must use POST, CSRF protection, authentication, Owner authorization, request limits, and rate limiting. It must not become an unauthenticated repository-probing API.

## Compatibility and Rollout

### Phase 1 — Contracts and Pure Validation

- Add source/provider enums and a strict pure GitHub public URL normalizer.
- Add conditional Repository schema behavior compatible with legacy records.
- Add source adapter interfaces and safe error classifications.
- Add unit, schema, migration, SSRF, argument-injection, and redaction tests.

### Phase 2 — Public Inspection and Detection

- Add bounded public GitHub metadata methods.
- Add the Owner-only inspect endpoint and server-side branch revalidation.
- Route detection through the source adapter.
- Add caching, provider-rate-limit handling, audit events, and controller tests.

### Phase 3 — Worker Clone and Manual Deployment

- Add credential-free exact-commit clone behavior.
- Route build jobs by persisted source type.
- Enforce Manual mode for Public Git.
- Test retry, selected commit, cleanup, inaccessible-source behavior, and healthy-release continuity.

### Phase 4 — Repository UX

- Add source choices, URL form, branch loading, connected-source labeling, replacement confirmation, and recovery states.
- Preserve the existing GitHub App chooser and installation flow.
- Complete desktop, mobile, keyboard, screen-reader, duplicate-submit, timeout, and validation-error testing.

### Phase 5 — Documentation and Live Evidence

- Update the User Guide, FAQ, product scope, workflows, data model, architecture, and acceptance blueprint to describe implemented behavior.
- Add operator notes for provider rate limits and public-source failures.
- Run real public Static, React, Vue, Express/Node.js, and Next.js repository deployments after the production worker plane exists.
- Record evidence as Passed, Failed, Blocked, or Not Run; do not infer deployment success from controller or clone tests.

Each phase must remain independently testable and preserve the GitHub App flow. No phase may mark Public Git implemented before a real worker deployment succeeds through the production route.

## Test Plan

### Unit and Schema

- Accepted URL forms normalize identically.
- Scheme, host, credentials, ports, query, fragment, encoded separators, malformed paths, option-like names, control characters, and oversized values fail before network access.
- Existing records without `sourceType` behave as `GITHUB_APP`.
- Conditional required fields and partial indexes accept only valid source combinations.
- Deployment-mode validation rejects Automatic for Public Git.

### Controller and Service

- Owner can inspect and connect a public source; Maintainer and Viewer cannot.
- CSRF, rate limit, duplicate submission, timeout, provider `404`, private response, and rate-limit response are safe and recoverable.
- Hidden metadata tampering cannot change normalized identity, visibility, branch, or SHA.
- Detection produces the same runtime result for equivalent GitHub App and Public Git sources.
- Replacement, disconnection, configuration versioning, and audit metadata remain correct.

### Worker and Security

- Public clone uses no token and no ambient credential helper.
- GitHub App clone retains short-lived token behavior and redaction.
- Exact commit, shallow-fetch fallback, remote removal, `.git` removal, timeout, output bounds, cleanup, symlink safety, and context-size limits pass.
- A source becoming private or disappearing fails without replacing the active release.
- Malicious URLs cannot trigger SSRF, local-file access, shell execution, Git option injection, or credential disclosure.

### UI and Accessibility

- Source choice and form states work at desktop/mobile widths and 200% zoom.
- Keyboard-only and screen-reader users can select a mode, inspect, choose a branch, connect, cancel, replace, and disconnect.
- Pending and errors are announced; focus moves logically; status is not color-only.
- Public Git explains Manual-only behavior before submission.
- GitHub App installation and repository selection remain unchanged for existing users.

### End-to-End

- Connect and deploy one public repository for every supported runtime.
- Retry an exact failed commit and deploy a selected reachable commit.
- Confirm Automatic cannot be enabled for Public Git.
- Convert a Public Git source to GitHub App and enable Automatic after authorization.
- Convert an Automatic GitHub App source to Public Git only after explicit Manual-mode confirmation.
- Make the source unavailable and prove the active healthy release remains served.

## Acceptance Criteria

The feature is complete only when:

- A project Owner can paste a valid public GitHub HTTPS URL, select a verified branch, connect it, run detection, and manually deploy an exact commit without installing the GitHub App.
- Private repositories and Automatic deployments still require GitHub App authorization.
- Existing repository records and GitHub App workflows remain backward compatible.
- No credential, raw provider response, unsafe URL, Git output, or private infrastructure detail appears in HTML, logs, errors, audit events, or job metadata.
- SSRF, redirect, URL parsing, Git argument, ambient credential, authorization, CSRF, duplicate-submit, and rate-limit tests pass.
- A failed or inaccessible public source never displaces the active healthy release.
- Desktop, mobile, keyboard, and screen-reader workflows pass.
- Focused tests, lint, formatting, configuration validation, the full suite, production audit, and `git diff --check` pass.
- Real Docker-backed deployment evidence exists on the isolated worker plane before the live checklist row is marked Passed.

## Release and Documentation Boundary

The code and local automated tests implement Public Git. Until deployment of the reviewed change and a real Docker-backed worker validation are complete:

- The currently deployed dashboard might still expose the earlier GitHub App-only page.
- Documentation must distinguish repository implementation from live hosting evidence.
- The production-readiness tracker must not count this planned capability as host or deployment evidence.
- The platform remains **NO-GO for customer application hosting** for the independent reasons recorded in the readiness tracker.

## External UX Reference

Render's current documentation distinguishes a public Git repository URL from a connected Git provider. Public URL sources are manually deployed, while automatic deployments require a connected GitHub, GitLab, or Bitbucket account:

- <https://render.com/docs/web-services>
- <https://render.com/docs/github>
- <https://render.com/docs/deploys>

These links explain the interaction model only. HelloDeploy's implementation, security policy, supported hosts, deployment engine, and acceptance evidence remain independent.
