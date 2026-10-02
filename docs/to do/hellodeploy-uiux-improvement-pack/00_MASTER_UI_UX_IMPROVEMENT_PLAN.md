# HelloDeploy UI/UX Improvement Master Plan

> Repository implementation evidence and remaining external gates are tracked in
> [IMPLEMENTATION_EVIDENCE.md](IMPLEMENTATION_EVIDENCE.md). The original requirements
> below remain the acceptance source of truth.

Updated: 2026-10-01
Scope: public site, authentication, onboarding, project workflow, deployments, settings, administration, responsive behavior, accessibility, trust, SEO, and UX quality gates.

## 1. Goal

Make HelloDeploy understandable and usable by a non-technical or moderately technical user without weakening the controls needed by experienced developers.

The target experience is:

1. A visitor understands what HelloDeploy does within one screen.
2. A new user knows what is supported before creating an account.
3. A first-time user can create and deploy a project without guessing the next step.
4. A returning user can see what needs attention from the dashboard.
5. Deployment status is understandable without reading raw infrastructure logs.
6. Advanced configuration remains available without dominating the main path.
7. Mobile, keyboard, dark-mode, and error-state behavior are treated as first-class requirements.
8. Production UI must match the repository version being reviewed.

## 2. Current Product Strengths to Preserve

The current repository already contains important UX foundations.

- Server-rendered Express + EJS interface with a consistent shell.
- Design tokens for color, spacing, typography, radius, shadows, and status states.
- Light and dark themes.
- Reduced-motion support.
- Skip-to-content support.
- Responsive table patterns.
- Consistent confirmation flow for destructive actions.
- Plain-language project overview states.
- Guided project milestones.
- Progressive disclosure through project details.
- Inline form validation on many high-risk forms.
- Role-aware navigation.
- Strong admin approval-request detail.
- Detailed legal and policy coverage.
- Guest, admin, system-wide, and onboarding audits already completed in the repository.

Do not remove these patterns unless a replacement clearly improves usability.

## 3. Key Problems Found in This Review

### P0: Production and repository can drift

The repository documents that production has previously run older UI code than the current repository. This invalidates UX reviews because code review may not represent what real users see.

Required direction:

- Display running release SHA/version in authenticated admin surfaces.
- Provide a reliable HelloDeploy self-release process.
- Add a deployment verification step that compares expected SHA with `/health`.
- Treat "repo UI is improved" as incomplete until production is verified.

### P0: Main domain discoverability and automated accessibility are unreliable

The public web crawler used during this review could reach deployed project subdomains but could not fetch `https://hellodeploy.online/`, its sitemap, or robots endpoint.

This needs direct production verification.

Required direction:

- Verify DNS resolution from multiple networks.
- Verify Cloudflare routing.
- Verify HTTP status for `/`, `/robots.txt`, `/sitemap.xml`, `/health`, and `/ready`.
- Add public metadata and crawler validation to release checks.
- Do not assume browser access proves search/indexing readiness.

### P1: Landing page explains features, but still feels like a developer project page

The landing page is accurate, but it is still a sequence of cards and technical feature descriptions.

Examples of friction:

- "self-hosted" can be confusing when the visitor is using the hosted pilot instance.
- AES-256-GCM is implementation detail before it is user value.
- There is no strong product screenshot or live dashboard preview.
- No dedicated pricing/service-plan page.
- No public documentation hub.
- The first CTA asks users to create an account before showing a realistic deployment preview.
- "What you can deploy" is useful but visually secondary.

Required direction:

- Lead with outcome and supported use case.
- Add a real product preview.
- Add a short "Is HelloDeploy right for your project?" compatibility block.
- Add public Docs, Service Limits, Status, and Pricing/Pilot pages.
- Keep infrastructure details as supporting trust content, not primary marketing copy.

### P1: Dashboard is still too close to a project directory

The dashboard currently centers on a short project table.

A useful deployment dashboard should answer:

- What is live?
- What failed?
- What is deploying now?
- What needs my action?
- What changed recently?
- Is the platform able to deploy right now?

Required direction:

- Add "Needs attention".
- Add active deployments.
- Add recent deployment activity.
- Add project health/live URL.
- Add failed deployment recovery CTA.
- Add system notices relevant to the user.
- Avoid duplicating the Projects page.

### P1: Project list lacks scale-oriented discovery

The user project list is a simple table.

Add:

- Search by name/slug/repository.
- Filter by status.
- Optional filter by role.
- Sort by recently updated, recently deployed, name.
- Project health/last deploy indicator.
- Live URL or domain indicator.
- Compact card mode on small screens if tables become dense.

### P1: Deployment list feedback needs real-time improvement

The repository backlog already identifies deployments-list refresh as unfinished.

Required direction:

- Poll or stream in-progress deployment rows.
- Update status, duration, and progress without full reload.
- Stop polling when no active deployment exists.
- Replace terminal hard reloads with local state updates where possible.
- Preserve accessible live-region messaging.

### P1: First deploy should be treated as one guided task, not a set of settings pages

The project overview already has milestones. Build on it.

Target first-deploy path:

1. Create project.
2. Connect GitHub.
3. Select repository and branch.
4. Detect application.
5. Review detected configuration.
6. Add required environment variables.
7. Resolve blockers.
8. Submit for approval when applicable.
9. Deploy.
10. Verify live URL.

Each step should explain:

- what this step does
- why it is needed
- whether it is complete
- what blocks progress
- what the next action is

### P2: Advanced settings should use progressive disclosure consistently

HelloDeploy has many technical controls:

- build/start commands
- output directory
- runtime
- health path
- deploy filters
- deployment mode
- deploy hooks
- maintenance
- domains
- environment variables
- team roles
- notifications
- quota behavior

Do not place every setting at equal prominence.

Default hierarchy:

Primary:
- repository and branch
- detected app type
- environment variables
- live domain
- deploy action

Secondary:
- build/start overrides
- health path
- path filters
- deploy hooks
- notification preferences

Advanced:
- legacy settings
- troubleshooting metadata
- raw commit IDs
- system-level technical values

### P2: Status language needs one canonical translation layer

The project overview translates states well. This should be reused everywhere.

Never expose raw internal enums as primary labels.

Canonical examples:

- QUEUED -> Waiting to start
- VALIDATING -> Checking setup
- BUILDING -> Building app
- DEPLOYING -> Publishing
- HEALTHY -> Live
- FAILED -> Failed
- CANCELLED -> Cancelled
- ROLLED_BACK -> Replaced

Keep raw values only in diagnostic details.

### P2: Trust information should be more structured

The public landing page currently includes pilot/operator information in a small paragraph.

Create a clear trust structure:

- Pilot status
- Who operates the instance
- Data/security summary
- Backups/recovery statement
- Service limits
- Supported application types
- What is not supported
- Status/uptime
- Contact/support
- Terms/privacy

The goal is clarity, not marketing exaggeration.

## 4. UX Principles for Implementation

### Principle A: One dominant next action

Every major page should have a clearly dominant primary action.

Examples:

- Empty dashboard -> Create Project
- Project with no repo -> Connect GitHub
- Undetected app -> Run Detection
- Missing required secrets -> Add Environment Variables
- Review needed -> Submit for Review
- Ready but not live -> Deploy
- Failed deployment -> View Failure and Retry
- Live project -> Open Application

### Principle B: Explain consequences before infrastructure details

Prefer:

"Your app failed to start. Check the start command and required environment variables."

Over:

"HEALTH_CHECK_TIMEOUT / container exited 1"

Raw detail can appear in expandable diagnostics.

### Principle C: Show state at the point of action

Do not make users navigate to another page to find whether an action worked.

Examples:

- domain verification state next to domain
- environment variable count near readiness
- deployment result near deploy button
- approval status near approval CTA

### Principle D: Use progressive disclosure

Keep common tasks visible. Move advanced and low-frequency settings behind clear labels.

### Principle E: Do not rely on color alone

Every state must combine color with text and, when useful, iconography.

### Principle F: Mobile is not a compressed desktop table

For dense operational lists, selectively convert table rows into stacked cards on narrow screens.

## 5. Recommended Implementation Order

### Phase 0: Production truth and measurement

Implement before visual redesign.

- production/repository SHA visibility
- crawlability checks
- baseline screenshots
- accessibility baseline
- Core Web Vitals instrumentation
- key funnel event logging

### Phase 1: Public site and trust

- landing hierarchy
- product preview
- supported stack
- public docs
- status page
- pricing/pilot explanation
- stronger footer/site map
- SEO metadata

### Phase 2: Signup and onboarding

- clearer account expectations
- post-verification destination
- first project checklist
- guided first deploy

### Phase 3: Dashboard and project discovery

- needs-attention panel
- active deployment panel
- recent activity
- searchable/filterable projects
- last deployment state

### Phase 4: Project overview and deployment workflow

- clearer primary action
- readiness summary
- failure recovery
- real-time list updates
- deployment detail improvements

### Phase 5: Settings and advanced configuration

- consistent settings grouping
- progressive disclosure
- clearer domains/secrets/team workflows
- advanced diagnostics separation

### Phase 6: Admin and operations

- admin attention queue
- operational status hierarchy
- risk labeling
- responsive admin tables
- support/debug context

### Phase 7: Design system, responsive behavior, and accessibility

- component inventory
- interaction-state consistency
- WCAG 2.2 AA checks
- target-size checks
- keyboard/focus audit
- contrast audit
- dark-mode audit
- mobile/tablet audit

### Phase 8: Performance, SEO, and trust signals

- Core Web Vitals
- asset strategy
- structured metadata
- sitemap/robots
- Open Graph
- canonical URLs
- public status
- release/crawl smoke tests

### Phase 9: QA and rollout

- automated UI tests
- visual regression
- release acceptance
- real-device testing
- usability test scripts
- production verification

## 6. Definition of Done for the Overall UI/UX Program

The improvement program is complete only when:

- production runs the reviewed release
- a first-time visitor can explain the product after viewing the landing page
- a first-time user can identify the next deployment step without documentation
- every blocked deployment shows an understandable reason and recovery action
- the dashboard provides unique operational value beyond `/projects`
- in-progress deployments update without manual page refresh
- all major controls are keyboard operable
- focus is visible and not obscured
- target sizes meet WCAG 2.2 requirements or documented exceptions
- mobile pages do not depend on horizontal scrolling for core workflows
- Core Web Vitals meet target thresholds at the 75th percentile
- crawler checks pass for public routes
- live production screenshots match the expected release
- automated tests cover critical UX state changes

## 7. Files in This Improvement Pack

- `01_PUBLIC_SITE_TRUST_AND_DISCOVERY.md`
- `02_AUTH_ONBOARDING_FIRST_DEPLOY.md`
- `03_DASHBOARD_AND_PROJECT_DISCOVERY.md`
- `04_PROJECT_AND_DEPLOYMENT_WORKFLOW.md`
- `05_SETTINGS_DOMAINS_ENV_TEAMS.md`
- `06_ADMIN_AND_OPERATIONS_UX.md`
- `07_DESIGN_SYSTEM_ACCESSIBILITY_RESPONSIVE.md`
- `08_PERFORMANCE_SEO_AND_PRODUCTION_TRUTH.md`
- `09_QA_ACCEPTANCE_AND_ROLLOUT.md`
