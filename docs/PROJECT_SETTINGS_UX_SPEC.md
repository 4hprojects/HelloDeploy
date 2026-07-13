# Project Settings UX Specification

Updated: 2026-07-13

## Purpose

This specification defines a consolidated project-settings experience for HelloDeploy. It is informed by sanitized observations from seven reference screenshots of a commercial deployment dashboard, but it does not reproduce those screenshots, identifiers, account details, domains, or product-specific wording.

The first delivery reorganizes capabilities HelloDeploy already supports. It must not imply that deferred capabilities exist, and it must not change project data, deployment behavior, permissions, quotas, or security boundaries merely to achieve visual similarity.

## Reference Interaction Patterns

The reference interface uses several patterns worth adapting:

- One long settings page divided into named, linkable sections.
- A sticky section index that shows the reader's current position.
- Grouped cards with a label and explanation on the left and the current value on the right.
- Read-first presentation with an explicit **Edit** action instead of permanently open forms.
- Save and Cancel actions kept inside the section being edited.
- Status badges beside operational resources such as domains.
- Contextual guidance near unfamiliar or consequential settings.
- Destructive actions visually isolated at the end of the page.

HelloDeploy should adopt these information and interaction patterns using its existing design tokens, components, terminology, and permission model. It should not copy the reference product's branding or unsupported controls.

## Current HelloDeploy State

Project configuration is currently distributed across multiple surfaces:

| Current surface  | Existing responsibility                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Project Overview | Project status, deployment mode, notification preference, maintenance mode, archive action, repository summary, and quick links |
| Project Settings | Project name and permanent deletion                                                                                             |
| Repository       | GitHub App connection, repository selection, and production branch                                                              |
| Detection        | Runtime detection, build/start commands, output directory, application port, health-check path, and build filters               |
| Deploy Hook      | Generate, reveal-once, regenerate, and revoke the deploy-hook URL                                                               |
| Domains          | Add, verify, inspect, and remove custom domains                                                                                 |
| Environment      | Add, import, reveal, replace, and delete encrypted environment secrets                                                          |

This distribution produces navigation drift: the project sidebar, overview quick links, and settings entry points expose different subsets of the same project-management workflow.

## Proposed Information Architecture

Add one owner-facing **Settings** destination with the following ordered sections. Each section receives a stable fragment identifier and participates in a shared section registry used by the settings index, project navigation, labels, and authorization metadata.

| Section and anchor                           | HelloDeploy content                                                                                                                    | Initial behavior                                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| General (`#general`)                         | Project name, read-only slug, project status, and effective resource limits                                                            | Name is editable. Slug and status are display-only. Quota-derived CPU, memory, storage, and other limits are informational, not selectable plans. |
| Source & Build (`#source-build`)             | Connected repository, production branch, detected runtime, build/start commands, output directory, application port, and build filters | Reuse repository and detection services. Repository connection remains a dedicated guided flow when no repository is connected.                   |
| Deployment (`#deployment`)                   | Deployment mode and deploy-hook management                                                                                             | Preserve current mode eligibility rules and reveal-once deploy-hook behavior. Do not display a stored raw deploy-hook token.                      |
| Custom Domains (`#custom-domains`)           | Domain quota, verification/approval status, DNS guidance, add/check/remove actions                                                     | Reuse the existing domain lifecycle and status badges. No certificate-control UI is implied.                                                      |
| Notifications (`#notifications`)             | Deployment email preference                                                                                                            | Preserve the existing All, Failures only, and None choices.                                                                                       |
| Health & Maintenance (`#health-maintenance`) | Health-check path, maintenance enabled state, and maintenance message                                                                  | Preserve path validation, queued route updates, and the current built-in maintenance page.                                                        |
| Danger Zone (`#danger-zone`)                 | Archive and permanent deletion                                                                                                         | Keep archive and deletion separate, explain reversibility, and require the existing typed-slug confirmation for deletion.                         |

### Settings Kept Separate

- **Environment** remains a separate owner-only page because it handles encrypted secrets, reveal actions, no-store responses, and higher-risk workflows.
- **Members** remains a separate owner-only page because invitations, role changes, removal, and ownership transfer are multi-step access-control workflows.
- **Deployments** and deployment details remain operational pages, not configuration sections.
- Repository connection and runtime detection may retain dedicated routes as focused workflows while their current state and edit entry points are composed into Settings.

## Shared Navigation Contract

Create one project-navigation source of truth rather than maintaining independent arrays or hard-coded links in the sidebar, overview, and settings page.

Each navigation entry should define:

- Stable key and user-facing label.
- Route or settings fragment.
- Required project role.
- Active-route matching rule.
- Optional icon and short description.

The settings section registry should similarly define the stable anchor, label, order, and role requirement. The desktop section index remains visible while scrolling. On narrow screens it becomes a compact in-page menu above the sections rather than a fixed side rail.

Fragment navigation must move focus to the section heading, preserve a visible focus indicator, and account for any sticky header so the heading is not obscured.

## Interaction Specification

### Display and Edit Modes

- Sections render current values in display mode by default.
- An explicit **Edit** action changes only that setting group into edit mode.
- Edit mode keeps Save and Cancel actions inside the same card.
- Cancel restores display mode without submitting or mutating data.
- Only one group should be edited at a time in the initial delivery to avoid conflicting submissions and unclear error focus.
- Existing focused routes and controller actions remain valid during migration; the consolidated page composes or redirects to them rather than duplicating business logic.

### Forms and Feedback

- Reuse existing server-side validators and service methods.
- Render field-level errors beside the affected control and a summary at the beginning of the active form.
- Preserve safe, non-secret submitted values after validation errors.
- Focus the error summary after a failed submission and link summary entries to fields where practical.
- Disable duplicate submissions, set `aria-busy`, and show an action-specific pending label.
- On success, return to display mode, retain the relevant fragment, and show the existing flash confirmation.
- Do not rely on color alone for validation, status, or success.

### Responsive and Accessible Behavior

- Desktop settings use a main content column and sticky section index.
- Tablet and mobile layouts stack setting labels, descriptions, values, and actions in that order.
- Tables such as custom domains retain headers for desktop and `data-label` context for stacked mobile rows.
- Every section uses a semantic heading with a stable `id`; the section index uses a named navigation landmark.
- Edit buttons have setting-specific accessible names when surrounding context is insufficient.
- Toggle controls expose their state with native inputs or `aria-pressed` as appropriate.
- Keyboard users can reach every edit, save, cancel, status-help, and destructive action in a predictable order.
- Reduced-motion preferences apply to scrolling, sticky-index highlighting, and edit-mode transitions.

## Security and Authorization

- Every mutation remains protected by authentication, the existing project-role middleware, and CSRF validation.
- Initial consolidated-setting mutations are Owner-only, matching the current routes. Read access must not be broadened accidentally when composing data into one page.
- Maintainers and Viewers must not receive owner-only forms, secret-management links, deploy-hook material, or destructive actions.
- Sensitive actions continue to emit audit events containing identifiers and setting names, never secret values or raw tokens.
- Deploy-hook generation/regeneration must retain reveal-once behavior. Stored token hashes must never be presented as recoverable values.
- Environment secret values must not be fetched or embedded in the consolidated settings page. Environment responses that may contain plaintext or submitted replacement values remain `Cache-Control: no-store`.
- Delete, archive, domain removal, repository disconnect, and deploy-hook regeneration/revocation retain explicit confirmation proportional to their impact.
- Error responses and logs must not include credentials, deploy-hook URLs, environment values, private repository access tokens, or unredacted infrastructure details.

## Existing Implementation Mapping

The consolidated UI must call existing behavior rather than introduce parallel settings logic:

| Capability                         | Current implementation boundary                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Project name and delete            | Project controller/service and project validator                                            |
| Archive and maintenance            | Project controller/service, deployment queue, and audit events                              |
| Repository and branch              | GitHub controller/service and Repository model                                              |
| Runtime/build/health configuration | Detection controller, project validator, detection service, and Project build configuration |
| Deployment mode and notifications  | Project controller and Project model enums/preferences                                      |
| Deploy hook                        | Deploy-hook controller/service and hashed token storage                                     |
| Custom domains                     | Domain controller/service, Domain model, verification job, and administrative approval      |
| Effective resource limits          | Existing quota resolution and admin-managed overrides; display-only for project owners      |

The project slug is stable and read-only after creation in the initial delivery. Changing that policy would affect routing, subdomains, Nginx configuration, links, confirmations, and uniqueness guarantees, so it requires a separate specification.

## Deferred Capabilities

The following reference capabilities are not part of the initial settings redesign:

| Deferred capability                   | Reason and prerequisite                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pull-request previews                 | Requires preview lifecycle, isolated routing, quotas, cleanup, GitHub event handling, and security policy.                                 |
| Edge caching controls                 | Requires an edge/cache architecture, invalidation model, safe defaults, and operational observability.                                     |
| Region selection                      | HelloDeploy is currently a self-hosted single-platform deployment target; multi-region placement is not modeled.                           |
| User-selectable instance sizing       | Resources are controlled through admin quotas and worker limits, not purchasable instance plans.                                           |
| Interactive shell access              | Requires terminal isolation, authorization, auditing, session limits, and container-security review.                                       |
| Horizontal or manual scaling          | Requires replica orchestration, routing, state, quota, health, and rollback semantics.                                                     |
| Persistent disks                      | Requires storage provisioning, mounts, lifecycle, backup, restore, and scheduling policy.                                                  |
| One-off jobs                          | Requires a separate job execution model, permissions, limits, logging, cancellation, and cleanup.                                          |
| Custom maintenance-page URL           | Current behavior serves a controlled built-in page with an optional message; external-page routing needs validation and failure semantics. |
| Reference-product networking controls | No equivalent public/private network or service mesh abstraction currently exists.                                                         |

Deferred rows may appear in roadmap documentation, but must not render as disabled or “coming soon” controls in the initial user interface unless product scope explicitly approves that communication.

## Delivery Plan

Implementation status: Phases 1–3 completed locally on 2026-07-13. Phase 4 evaluation is documented separately; every evaluated capability remains deferred pending an accepted ADR and explicit product approval.

### Phase 1: Settings Shell and Navigation

- [x] Add the consolidated Settings route and page shell.
- [x] Add the shared project-navigation and settings-section registries.
- [x] Render semantic section anchors and responsive section navigation.
- [x] Preserve all existing routes and links during migration.

### Phase 2: Compose Existing Capabilities

- [x] Compose General, Source & Build, Deployment, Domains, Notifications, Health & Maintenance, and Danger Zone from existing service/controller data.
- [x] Move entry points progressively while keeping existing actions and validation authoritative.
- [x] Keep Environment, Members, Deployments, repository connection, and detection execution as focused workflows where required.

### Phase 3: Interaction and Accessibility Standardization

- [x] Apply read-first/edit-on-demand behavior and consistent Save/Cancel/pending states.
- [x] Standardize inline errors, focus management, sticky-index state, mobile stacking, status help, and destructive confirmations.
- [x] Remove obsolete duplicate quick links only after the shared navigation covers every destination.

### Phase 4: Deferred Capability Evaluation

- [x] Evaluate each deferred capability across product need, architecture, security, operations, acceptance evidence, and approval gates in the [Deferred Capability Evaluations](PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md).
- Do not use placeholder controls or local substitutes to claim parity.

## Acceptance Criteria

### End-to-End Owner Workflow

| Entry point        | Primary action                                             | Required feedback                                                 | Recovery and completion state                                |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Overview checklist | Follow the single next incomplete action                   | Current progress plus one primary Next action                     | Return to Overview with the completed row marked             |
| Repository         | Connect access and select repository/branch                | Connected identity and branch without credentials                 | Actionable access/configuration error; retry in place        |
| Detection          | Detect and review build settings                           | Runtime, warnings, commands, port, output, and filters            | Preserve safe values and rerun detection                     |
| Settings           | Edit one supported group                                   | In-context pending, validation, success, and fragment return      | Cancel resets; errors reopen and focus the group             |
| Environment import | Select, review detected count, confirm replacement, import | No values displayed; imported count on success                    | Invalid files produce no partial writes; select another file |
| Stored secrets     | Reveal or replace explicitly                               | Masked default, page-scoped reveal, blank-means-unchanged editing | Clear removes plaintext; deletion requires confirmation      |
| Deployments        | Trigger and follow deployment                              | Duplicate prevention, live stages/logs, terminal outcome          | Reconnect logs; failed candidate preserves healthy release   |
| Domains            | Add and verify hostname                                    | DNS and approval status with actionable guidance                  | Retry verification or remove with confirmation               |

The repository-backed [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md) owns execution status. A public endpoint result cannot mark an authenticated workflow row Passed.

### Functional

- Every initial settings section displays current data from the existing authoritative model/service.
- Every supported edit invokes existing validation, authorization, service, queue, and audit behavior.
- Direct links to every settings fragment work and return to the same fragment after validation or success.
- Existing focused routes remain backward compatible until an explicitly planned removal.
- No deferred feature is described or presented as implemented.

### Security and Permissions

- Owner-only controls are absent and inaccessible to Maintainers and Viewers.
- CSRF failures reject mutations without changing project state.
- Secret values and raw deploy-hook tokens never appear in consolidated settings HTML, logs, flash messages, or validation errors.
- Destructive actions retain explicit confirmation and audited outcomes.

### Desktop and Mobile

- The desktop section index remains usable while scrolling and indicates the active section without color alone.
- Mobile layout places the section menu before content and avoids horizontal page scrolling.
- Setting values, help text, actions, domain rows, and error messages remain readable at supported breakpoints.

### Keyboard and Screen Reader

- A keyboard-only user can navigate sections and complete every supported edit.
- Fragment navigation moves focus to the intended heading without hiding it under sticky UI.
- Section navigation, forms, toggles, statuses, errors, pending states, and confirmations have meaningful accessible names and announcements.
- Focus returns to a logical control after Save, Cancel, or confirmation dismissal.

### Verification

- Add focused controller/service tests only where composition changes behavior boundaries.
- Add UI source/render tests for the shared registries, anchors, role-based controls, error contracts, responsive classes, and accessible labels.
- Run relevant focused tests after each phase.
- Before broad implementation completion, run `npm run lint`, `npm run format:check`, and `npm test`.

## Evidence Boundary

This specification records sanitized design observations only. Repository documentation must not include the source screenshots, absolute workstation paths, visible service identifiers, personal email addresses, real domain names, or claims of affiliation with the reference product.
