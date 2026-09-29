# HelloDeploy Workflow UI Redesign Specification

## Document Purpose

This document defines the implementation plan for redesigning the HelloDeploy workflow UI so non-technical users can deploy websites without needing to understand infrastructure concepts.

The target experience is:

```text
Connect project
↓
HelloDeploy analyzes it
↓
User provides only missing information
↓
Publish
↓
Website is live
```

The platform may still use technical systems such as Node.js, process managers, reverse proxies, DNS, SSL certificates, ports, health checks, and deployment hooks internally.

Those implementation details should remain hidden from the default user experience unless the user explicitly enters Advanced Mode.

---

# 1. Product Goal

HelloDeploy should allow a user who knows how to create or obtain a website project, but does not know Linux server administration, to deploy that website successfully.

The user should not need to understand:

- Nginx
- PM2
- Linux services
- reverse proxies
- internal ports
- runtime processes
- DNS record theory
- SSL certificate issuance
- health-check endpoints
- deployment hooks
- server instance terminology
- process restart strategies

The default UI should focus on the user's intent:

- choose a website
- connect a project
- supply required settings
- publish the website
- connect a custom domain
- confirm the website is working

---

# 2. Core Product Principle

HelloDeploy must distinguish between:

1. What the user wants to do
2. What the infrastructure needs to do

The user-facing workflow should use plain language.

The infrastructure workflow may remain technical internally.

Example:

User sees:

```text
Publishing your website
✓ Preparing project
✓ Installing requirements
✓ Building website
● Starting website
○ Checking website
○ Publishing
```

Internal system may execute:

```text
git clone
npm ci
npm run build
allocate internal port
generate process config
start application
configure reverse proxy
reload proxy
perform health check
issue SSL
register deployment
```

The first workflow is the product experience.

The second workflow is an implementation detail.

---

# 3. Target Users

## 3.1 Primary User

A non-technical or moderately technical website owner who:

- has a GitHub repository or project files
- understands basic website concepts
- may know environment variables
- may not understand server infrastructure
- wants a live website with minimal configuration

Examples:

- students
- instructors
- freelancers
- small business owners
- designers
- content creators
- beginner developers

## 3.2 Secondary User

A developer who wants:

- detailed runtime configuration
- direct access to logs
- deploy hooks
- build commands
- start commands
- health checks
- server controls
- runtime settings

The system must support both groups without forcing technical controls onto primary users.

---

# 4. UX Modes

HelloDeploy should support two interface modes.

## 4.1 Simple Mode

Simple Mode is the default.

The user sees:

- Overview
- Deployments
- Domain
- Environment
- Usage
- Settings

Simple Mode should hide infrastructure-specific settings.

## 4.2 Advanced Mode

Advanced Mode exposes:

- runtime
- build command
- start command
- root directory
- output directory
- internal port
- health check path
- deployment hooks
- process controls
- raw logs
- server information
- proxy configuration where appropriate

Advanced Mode should not alter the project's underlying configuration unless the user saves changes.

---

# 5. Terminology Rules

Use user-focused wording in Simple Mode.

| Technical Term        | Simple Mode Label         |
| --------------------- | ------------------------- |
| Deployment            | Publish                   |
| Redeploy              | Publish Again             |
| Repository            | GitHub Project            |
| Environment Variables | Environment Settings      |
| Build Command         | Build Configuration       |
| Custom Domain         | Your Domain               |
| Deploy Hook           | Automatic Publishing Link |
| Runtime               | Website Technology        |
| Health Check          | Website Status            |
| Logs                  | Technical Logs            |
| Instance              | Server                    |
| Service               | Website                   |
| Production            | Live Website              |
| DNS Verification      | Domain Connection Check   |
| Reverse Proxy         | Hidden in Simple Mode     |
| Process Manager       | Hidden in Simple Mode     |

Advanced Mode may use the technical terminology.

---

# 6. Main User Journey

The primary deployment flow should contain five conceptual stages.

```text
1. Add Website
2. Connect Project
3. Analyze Project
4. Complete Missing Requirements
5. Publish
```

After publishing:

```text
6. Website Live
7. Connect Domain
8. Monitor Website
```

The user should never be forced into infrastructure configuration unless automatic detection fails.

---

# 7. Phase 1: Deployment Entry Flow

## Objective

Replace infrastructure-oriented project creation with a guided website deployment workflow.

## UI

Primary dashboard CTA:

```text
[ Deploy a Website ]
```

Do not use:

```text
Create Service
Create Instance
Create Web Process
```

## First Screen

Title:

```text
Where is your website?
```

Options:

```text
[ GitHub ]
Connect a GitHub project

[ Upload Project ]
Upload a project folder or ZIP

[ Starter Website ]
Start from a template
```

Optional future option:

```text
[ Import Existing Website ]
Move an existing project to HelloDeploy
```

## Acceptance Criteria

- User can begin deployment from one primary CTA.
- User is not asked to choose a runtime or service type.
- User is not asked for a port.
- User is not asked for a process manager.
- User is not asked to configure Nginx.
- GitHub, upload, and starter project paths are represented by independent workflow states.
- Existing advanced deployment features remain accessible through Advanced Mode or a secondary entry point.

## Verification

Test with a user who does not know:

- Nginx
- PM2
- ports
- reverse proxies

The user should still understand how to begin deployment.

---

# 8. Phase 2: GitHub Project Selection

## Objective

Allow users to connect and choose a repository without exposing unnecessary Git concepts.

## Screen

Title:

```text
Choose your website
```

Components:

- GitHub account status
- repository search
- repository list
- optional organization selector
- branch selector hidden by default
- Continue button

Example:

```text
Search projects...

○ hellorun
○ hellouniversity
○ hellopera
○ portfolio
```

Default branch should be automatically detected.

Branch control may appear under:

```text
Advanced options
```

## Required Backend State

Store:

```text
provider
repository owner
repository name
repository ID if available
default branch
selected branch
installation/account authorization
repository visibility
last commit hash
```

## Acceptance Criteria

- Default branch is automatically selected.
- Private repositories work when authorization permits access.
- Repository list supports search.
- User can continue without setting build configuration.
- User can manually change branch only if needed.
- Repository permissions errors are displayed in plain language.

## Error Copy Example

Avoid:

```text
403 resource inaccessible by integration
```

Use:

```text
HelloDeploy cannot access this GitHub project.

Reconnect GitHub or update repository permissions.
```

---

# 9. Phase 3: Automatic Project Analysis

## Objective

Detect as much project configuration as possible before asking the user for information.

## Detection Inputs

Inspect files such as:

```text
package.json
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lock
next.config.js
next.config.mjs
vite.config.js
vite.config.ts
astro.config.mjs
nuxt.config.ts
requirements.txt
pyproject.toml
Pipfile
composer.json
Dockerfile
Procfile
dist/
build/
public/
```

This list should be extensible.

## Detection Output

Create a normalized analysis result.

Example:

```json
{
  "framework": "nextjs",
  "runtime": "node",
  "runtimeVersion": "22",
  "packageManager": "npm",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "startCommand": "npm start",
  "outputDirectory": null,
  "requiresServer": true,
  "detectedEnvironmentKeys": ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"],
  "confidence": 0.96
}
```

## User-Facing Screen

```text
Analyzing your project...

✓ Next.js detected
✓ Node.js detected
✓ Build settings found
✓ Start settings found
✓ Required environment settings detected
```

Do not expose raw commands by default.

## Detection Confidence

Each detected setting should contain a confidence status:

```text
high
medium
low
manual
```

If confidence is high:

- auto-configure
- do not ask user

If confidence is medium:

- use auto-configuration
- allow user to review

If confidence is low:

- ask user to confirm

If detection fails:

- show focused configuration form
- do not dump the user into a generic advanced settings page

## Acceptance Criteria

- Supported frameworks can be detected automatically.
- Build/start commands are inferred where possible.
- Package manager is inferred from lock files.
- Required environment settings are extracted where feasible.
- Detection results are persisted.
- Manual override exists in Advanced Mode.
- Detection failure produces a guided fallback.

---

# 10. Phase 4: Website Identity

## Objective

Ask only for information that directly affects the user's website identity.

## Screen

```text
Website name
[ HelloUniversity ]

Website address
hellouniversity.hellodeploy.online

✓ Available
```

## Rules

Website slug should:

- be automatically generated from the project name
- be editable
- be validated in real time
- show availability
- explain invalid characters
- prevent collisions

## Acceptance Criteria

- Suggested website name is prefilled.
- Suggested subdomain is prefilled.
- User can edit both.
- Availability is checked before continuing.
- Reserved names are blocked.
- Existing project behavior is preserved.

---

# 11. Phase 5: Environment Settings

## Objective

Help users provide configuration values without requiring them to understand environment variable mechanics.

## Screen Structure

```text
Environment settings

We found settings your website needs.

✓ NODE_ENV
Managed by HelloDeploy

! DATABASE_URL
Required

! SUPABASE_URL
Required

! SUPABASE_ANON_KEY
Required

✓ PORT
Managed by HelloDeploy
```

## Environment Variable Categories

Every variable should be classified as:

```text
platform_managed
required_user_input
optional_user_input
detected_existing
unknown
```

## Platform-Managed Variables

Examples:

```text
PORT
NODE_ENV
HOST
internal deployment identifiers
```

The exact values depend on runtime design.

Users should not enter platform-managed values in Simple Mode.

## Input Security

Secret values must:

- be encrypted at rest
- not be displayed after initial save except through secure reveal flow if supported
- never appear in normal deployment logs
- be masked in UI
- support replacement
- support environment-specific values later

## Validation

Where possible, validate:

- URL format
- integer format
- known connection string formats
- empty required values

Do not attempt remote connection tests unless explicitly designed.

## Acceptance Criteria

- Platform-managed variables cannot accidentally be overridden in Simple Mode.
- Required values block deployment.
- Optional values do not block deployment.
- Secrets are masked.
- Users receive plain-language descriptions where metadata exists.
- Advanced Mode can expose full environment configuration.

---

# 12. Phase 6: Deployment Readiness Check

## Objective

Catch predictable problems before the deployment starts.

This phase is critical.

## Screen

```text
Ready to publish

Project
HelloUniversity

Technology
Next.js

Branch
main

Website
hellouniversity.hellodeploy.online

Environment
✓ Complete

--------------------------------

✓ Project configuration valid
✓ Dependencies detected
✓ Build configuration ready
✓ Start configuration ready
✓ Website address available
✓ Server capacity available

[ Publish Website ]
```

## Readiness Checks

At minimum check:

- repository access
- branch exists
- commit available
- supported runtime
- install strategy determined
- build strategy determined
- start strategy determined when required
- required environment values present
- website slug valid
- server capacity available
- project quota available
- no incompatible duplicate active deployment job

Optional future checks:

- database connectivity
- external service credentials
- required runtime version
- disk capacity
- build cache availability

## Failure Example

Instead of:

```text
Build process cannot initialize.
```

Show:

```text
Your website needs one more setting.

DATABASE_URL is required before this website can start.

[ Add Database URL ]
```

## Acceptance Criteria

- Predictable configuration failures are surfaced before build.
- User can return directly to the relevant configuration field.
- Deployment cannot begin with missing required data.
- Readiness results are stored for diagnostics.

---

# 13. Phase 7: Human-Friendly Deployment Progress

## Objective

Show meaningful deployment progress without forcing users to read raw logs.

## Deployment State Machine

Recommended states:

```text
queued
preparing
installing
building
configuring
starting
checking
publishing
success
failed
cancelled
```

## User-Facing Progress

```text
Publishing HelloUniversity

✓ Preparing website
✓ Installing requirements
✓ Building website
● Starting website
○ Checking website
○ Publishing
```

Each stage should have:

- user-facing label
- internal state
- start timestamp
- end timestamp
- status
- optional diagnostic reference

## Technical Logs

Technical logs should be available through:

```text
View technical logs
```

Logs should not be the default content.

## Failure Translation Layer

The backend should classify failures.

Examples:

```text
DEPENDENCY_INSTALL_FAILED
BUILD_FAILED
MISSING_ENVIRONMENT_VALUE
APPLICATION_START_FAILED
PORT_BIND_FAILED
HEALTH_CHECK_FAILED
DOMAIN_CONFIGURATION_FAILED
SERVER_CAPACITY_EXCEEDED
GITHUB_ACCESS_FAILED
```

Map these to plain-language explanations.

Example:

Internal:

```text
ECONNREFUSED 127.0.0.1:3000
```

Simple UI:

```text
HelloDeploy started your website, but it did not respond successfully.

Check the required environment settings or view technical logs.
```

Advanced UI may show the full error.

## Acceptance Criteria

- Progress survives page refresh.
- Deployment status is persisted.
- Logs stream independently from high-level progress.
- User can retry failed deployment.
- Retry creates a new deployment attempt.
- Failed deployment does not destroy the last working deployment.
- Technical logs remain available.

---

# 14. Phase 8: Successful Deployment Screen

## Objective

Make completion clear and provide the next logical action.

## Screen

```text
Your website is live

HelloUniversity

https://hellouniversity-4e6a.hellodeploy.online

[ Open Website ]

--------------------------------

Make it yours

[ Connect Your Domain ]

Keep your website updated

✓ Automatically publish new GitHub changes

--------------------------------

Next steps

○ Connect your domain
○ Review environment settings
○ View website activity
```

## Acceptance Criteria

- Live URL is immediately visible.
- Open Website button opens the live site.
- Successful deployment becomes the current production version.
- Previous deployment remains available in deployment history.
- Custom domain flow is directly accessible.
- GitHub auto-publishing state is shown.

---

# 15. Phase 9: Simplified Project Dashboard

## Objective

Replace infrastructure-first dashboards with website-first dashboards.

## Main Header

```text
HelloUniversity
● Live

hellouniversity.online
hellouniversity-4e6a.hellodeploy.online

Last published
2 minutes ago from main

[ Open Website ] [ Publish Again ]
```

## Main Navigation

```text
Overview
Deployments
Domain
Environment
Usage
Settings
```

Optional:

```text
Advanced
```

or:

```text
Simple | Advanced
```

## Overview Content

```text
Website status
● Online

Latest publish
✓ Successful

Source
GitHub
henson/hellouniversity
main

Automatic publishing
✓ Enabled

Domain
✓ hellouniversity.online

SSL
✓ Secured

Server
✓ Healthy
```

## Do Not Show in Simple Overview

Avoid prominently displaying:

- server IP
- Nginx config
- process ID
- internal port
- PM2 process name
- reverse proxy path
- raw runtime configuration

Those belong in Advanced Mode.

---

# 16. Phase 10: Custom Domain Wizard

## Objective

Make connecting a domain understandable to users who do not know DNS.

## Entry Screen

```text
Connect your domain

What domain do you want to use?

[ hellouniversity.online ]

[ Continue ]
```

## Provider Detection

Detect provider where practical.

Possible methods:

- authoritative nameserver lookup
- known DNS provider patterns
- account integration if connected

Example:

```text
Domain provider detected

Cloudflare
```

## Preferred Experience

If provider integration exists:

```text
[ Connect Cloudflare ]
```

OAuth or API authorization should allow HelloDeploy to create required DNS records with user permission.

## Manual Fallback

```text
Add this record in Cloudflare

Type
CNAME

Name
@

Target
domains.hellodeploy.online

[ Copy ]
```

Then:

```text
Waiting for your domain...

● Checking DNS
```

After detection:

```text
✓ Domain connected
✓ SSL certificate created
✓ HTTPS enabled

hellouniversity.online is now live
```

## Domain State Machine

Recommended statuses:

```text
pending
dns_required
checking_dns
dns_verified
ssl_issuing
active
error
removed
```

## Domain Diagnostics

Simple Mode:

```text
Your domain is still connecting.

DNS changes can take some time to appear.
```

Advanced Mode may display:

- expected records
- observed records
- nameservers
- certificate state
- validation errors

## Acceptance Criteria

- Domain workflow is guided.
- User receives exact required record values.
- Copy buttons exist for values.
- DNS status can be rechecked.
- SSL status is automatic.
- Root and www behavior is defined.
- Redirect behavior is configurable.
- Existing working domains are not interrupted by UI migration.

---

# 17. Phase 11: Automatic GitHub Publishing

## Objective

Allow the site to update automatically after changes are pushed.

## Simple Mode

```text
Automatic publishing

[✓] Publish updates from GitHub

Branch
main
```

Use plain language instead of webhook terminology.

## Internally

The system may use:

- GitHub webhooks
- provider app events
- deployment hooks
- commit tracking

## Required Behaviors

- ignore duplicate events
- associate deployment with commit hash
- show commit message when available
- prevent overlapping deployments when unsafe
- queue or cancel superseded builds according to policy

## Acceptance Criteria

- Push to configured branch creates deployment.
- Deployment links to commit.
- User can disable automatic publishing.
- Manual Publish Again remains available.
- Failed automated deployment does not replace current live deployment.

---

# 18. Phase 12: Advanced Mode

## Objective

Retain developer control without cluttering the default experience.

## Advanced Sections

### Build

- root directory
- install command
- build command
- output directory
- build environment

### Runtime

- runtime
- runtime version
- start command
- internal port
- health check
- restart behavior

### Deployment

- deploy hook
- GitHub branch
- auto-publish
- build cache
- deployment retention

### Server

Expose only if HelloDeploy's product architecture requires server-level controls.

Potential fields:

- assigned host
- resource allocation
- process status
- restart controls

### Logs

- build logs
- runtime logs
- reverse proxy logs if appropriate
- timestamp filtering
- search
- download later if required

## Safety Rules

Advanced changes that can break the website should require:

```text
Save and Publish
```

rather than silently changing the live application.

---

# 19. Phase 13: Error Recovery UX

## Objective

Every major failure should explain:

1. What happened
2. What the user can do
3. Where they should go

Example:

```text
Your website could not start.

HelloDeploy successfully built the project, but the website stopped while starting.

Common causes:
- a required environment setting is missing
- the start command is incorrect
- the application exited unexpectedly

[ Review Environment ]
[ View Technical Logs ]
[ Try Again ]
```

## Error Requirements

Every known error should contain:

```text
error code
user title
user explanation
recommended action
technical details
related deployment ID
timestamp
```

## Acceptance Criteria

- No raw stack trace is the primary error message.
- Every common error offers at least one next action.
- Advanced users can reach technical diagnostics.
- Error state is persisted.

---

# 20. Phase 14: Deployment History and Rollback

## Objective

Give users confidence that publishing a broken version will not permanently take the site down.

## Deployment History

Each deployment should show:

```text
status
timestamp
source branch
commit hash
commit message
trigger
duration
deployed version
```

Example:

```text
✓ Live
main
Fix login redirect
12 minutes ago

✓ Previous
main
Update home page
2 hours ago
```

## Rollback

Simple UI:

```text
[ Restore This Version ]
```

Do not use:

```text
promote previous release artifact
```

## Acceptance Criteria

- Last working version is preserved.
- Failed deployments never become live.
- User can restore a previous successful deployment.
- Rollback itself creates an auditable deployment event.
- Domain remains attached during rollback.

---

# 21. Phase 15: Usage and Capacity UI

## Objective

Explain resource use without requiring users to understand infrastructure billing models.

## Simple View

Possible cards:

```text
Websites
3 of 10

Storage
2.4 GB

Build minutes
128 this month

Data transfer
18 GB this month
```

If resources are server-based:

```text
Server capacity
Normal
```

Avoid exposing CPU percentages without context unless useful.

Advanced Mode may expose:

- CPU
- RAM
- disk
- process usage
- network transfer
- load

## Acceptance Criteria

- Users can understand whether they are near a plan limit.
- Capacity problems appear before deployment where possible.
- Upgrade path can be integrated later.

---

# 22. Suggested System Architecture Changes

The UI redesign requires a normalized deployment model.

Recommended conceptual entities:

```text
User
Workspace
Website
SourceConnection
Deployment
DeploymentStage
EnvironmentVariable
Domain
RuntimeConfiguration
BuildConfiguration
HealthCheck
UsageRecord
AuditEvent
```

## Website

Represents the logical website.

Contains:

```text
id
workspace_id
name
slug
status
source_connection_id
production_deployment_id
created_at
updated_at
```

## Deployment

Represents one immutable publish attempt.

Contains:

```text
id
website_id
commit_hash
branch
trigger_type
status
started_at
completed_at
failure_code
failure_summary
artifact_reference
```

## DeploymentStage

Contains:

```text
deployment_id
stage
status
started_at
completed_at
diagnostic_reference
```

## SourceConnection

Contains:

```text
provider
owner
repository
branch
authorization_reference
auto_publish
```

## RuntimeConfiguration

Contains:

```text
detected_framework
runtime
runtime_version
install_command
build_command
start_command
output_directory
internal_port_strategy
health_check_path
detection_confidence
```

## Domain

Contains:

```text
hostname
provider
status
verification_state
ssl_state
redirect_mode
created_at
verified_at
```

---

# 23. API Requirements

The frontend should not depend on raw infrastructure commands.

Recommended API behavior.

## Analyze Project

```text
POST /api/websites/analyze
```

Returns normalized project analysis.

## Readiness Check

```text
POST /api/websites/:id/readiness
```

Returns:

```json
{
  "ready": false,
  "checks": [
    {
      "key": "environment",
      "status": "failed",
      "message": "DATABASE_URL is required",
      "action": "environment"
    }
  ]
}
```

## Start Deployment

```text
POST /api/websites/:id/deployments
```

## Deployment Status

```text
GET /api/deployments/:id
```

## Deployment Events

Prefer:

- Server-Sent Events
- WebSocket
- efficient polling fallback

for progress updates.

## Domain Check

```text
POST /api/domains/:id/check
```

## Rollback

```text
POST /api/websites/:id/rollback
```

The exact route naming may follow existing project conventions.

---

# 24. Analytics Events

Track the redesigned funnel.

Recommended events:

```text
deploy_flow_started
deploy_source_selected
github_project_selected
project_analysis_completed
project_analysis_failed
environment_required
readiness_passed
readiness_failed
deployment_started
deployment_failed
deployment_succeeded
domain_flow_started
domain_verified
ssl_activated
advanced_mode_opened
rollback_started
rollback_completed
```

Measure:

- deployment completion rate
- average time to first live website
- failure rate by stage
- percentage of users entering Advanced Mode
- domain completion rate
- most common readiness failures
- most common deployment failures

The central KPI should be:

```text
Time from "Deploy a Website" to live URL
```

Secondary KPI:

```text
Percentage of first deployment attempts that succeed
```

---

# 25. Accessibility Requirements

The workflow should support:

- keyboard navigation
- visible focus states
- labels associated with inputs
- non-color status indicators
- screen-reader-readable deployment states
- accessible progress indicators
- meaningful button names
- sufficient contrast
- errors connected to affected inputs

Do not communicate deployment state through color alone.

Use:

```text
✓ Successful
! Needs attention
× Failed
● In progress
```

with textual equivalents for accessibility.

---

# 26. Responsive Requirements

Critical flows must work on:

- desktop
- tablet
- mobile

Priority mobile flows:

- deployment status
- retry deployment
- environment setting updates
- domain status
- open website
- deployment history

Advanced server configuration may be optimized for desktop but must remain usable on mobile.

---

# 27. Migration Requirements

The UI redesign must not break existing deployed websites.

Existing projects should be migrated into the new normalized model.

Migration should derive:

```text
website identity
source repository
branch
runtime
build command
start command
environment settings
domain mappings
current live deployment
```

Unknown values should be marked:

```text
legacy
manual
unknown
```

Do not invent detection confidence for legacy values.

Existing active domains and routing must remain untouched during UI migration.

---

# 28. Implementation Order

Implement in this order.

## Phase A: Foundation

Build:

- normalized website model
- deployment state model
- project analysis model
- domain state model
- error classification
- Simple/Advanced UI mode support

Do not redesign every screen before these models exist.

### Exit Criteria

- backend can represent deployment lifecycle
- frontend can consume normalized state
- no dependency on raw process status for primary UI

---

## Phase B: New Deployment Wizard

Build:

1. Deploy a Website CTA
2. source selection
3. GitHub project selection
4. automatic analysis
5. website identity
6. environment settings
7. readiness check

### Exit Criteria

A supported GitHub project can reach "Ready to Publish" without exposing server configuration.

---

## Phase C: Deployment Experience

Build:

1. human-readable deployment stages
2. technical logs drawer
3. error translation
4. retry behavior
5. success page

### Exit Criteria

User can publish a supported website and understand success or failure without reading raw logs.

---

## Phase D: Project Dashboard

Build:

1. overview
2. deployment history
3. environment page
4. publish again
5. Simple/Advanced switch

### Exit Criteria

User can manage a deployed website without server knowledge.

---

## Phase E: Domain Wizard

Build:

1. domain input
2. provider detection
3. manual DNS guidance
4. DNS recheck
5. SSL state
6. redirect behavior

Then add provider integrations such as Cloudflare later.

### Exit Criteria

A user can connect a custom domain using only guided instructions.

---

## Phase F: Rollback and Reliability

Build:

- previous deployment preservation
- failed deployment isolation
- restore previous version
- deployment audit trail
- rollback status

### Exit Criteria

A broken deployment cannot automatically replace the last healthy live version.

---

## Phase G: Automation

Build:

- GitHub auto-publish
- branch configuration
- duplicate event handling
- queued deploy behavior
- commit metadata

### Exit Criteria

Push to configured branch can safely publish a new version.

---

## Phase H: Polish and Analytics

Build:

- funnel analytics
- accessibility improvements
- mobile optimization
- microcopy review
- loading skeletons
- empty states
- edge-case states

### Exit Criteria

Key workflow metrics are measurable and the deployment flow passes accessibility and responsive testing.

---

# 29. Quality Gates

Each phase must pass these gates before continuing.

## Functional Gate

- main path works
- failure path works
- refresh recovery works
- permissions checked
- retries handled
- state persisted

## UX Gate

A user should always know:

- where they are
- what HelloDeploy is doing
- whether action is required
- what to do next

## Data Gate

- no secrets exposed
- deployment state is auditable
- current live deployment is identifiable
- domain state is persisted
- failed deployments do not overwrite successful state

## Reliability Gate

Test:

- build failure
- runtime failure
- missing environment value
- GitHub permission loss
- server capacity failure
- DNS not propagated
- SSL issuance delay
- page refresh during deployment
- duplicate deploy trigger
- deployment cancellation

## Regression Gate

Existing functionality must continue working:

- existing sites
- existing custom domains
- current environment values
- existing GitHub integrations
- current deployment histories where available

---

# 30. Agent Implementation Rules

The coding agent must follow these rules.

1. Inspect the existing HelloDeploy architecture before changing the workflow.
2. Reuse existing services when they already provide the required behavior.
3. Do not duplicate deployment logic inside frontend components.
4. Introduce normalized backend states when the existing API leaks infrastructure-specific implementation details.
5. Preserve backwards compatibility for existing websites.
6. Do not remove advanced functionality merely because it is hidden from Simple Mode.
7. Do not expose secrets in logs, UI responses, analytics, or errors.
8. Keep deployment attempts immutable wherever practical.
9. Keep the current live deployment separate from the newest deployment attempt.
10. Do not allow failed deployments to automatically replace the last healthy live deployment.
11. All user-facing failure messages must contain a useful next action.
12. Use feature flags for major workflow changes if the current production UI must remain available during rollout.
13. Add tests before removing the legacy deployment workflow.
14. Follow the existing HelloLaunch project architecture and project conventions.
15. Update project documentation when deployment state, routes, or architecture changes.

---

# 31. Suggested Feature Flags

Recommended:

```text
new_deploy_wizard
simple_mode
project_auto_detection
deployment_readiness
human_readable_deploy_progress
new_domain_wizard
deployment_rollback
github_auto_publish_v2
```

Feature flags allow phased rollout without breaking current users.

---

# 32. Testing Matrix

At minimum test these project types:

## Static Site

Example:

```text
HTML/CSS/JavaScript
```

Expected:

- no runtime server required
- output automatically detected or selected

## Vite

Expected:

```text
npm install
npm run build
dist
```

User should not need to enter those values.

## Next.js

Test:

- server-rendered project
- environment values
- production start command

## Node/Express

Test:

- dynamic port handling
- start command detection
- health status

## Unsupported Project

Expected:

```text
HelloDeploy could not fully determine how this project should run.

Review these settings:
- build command
- start command

[ Configure Project ]
```

Do not present a generic crash.

---

# 33. UX Copy Rules

Use short action-oriented text.

Prefer:

```text
Your website is ready to publish.
```

Avoid:

```text
Deployment configuration validation completed successfully.
```

Prefer:

```text
Your website could not start.
```

Avoid:

```text
Runtime process exited unexpectedly.
```

Prefer:

```text
Connect your domain.
```

Avoid:

```text
Configure custom DNS hostname.
```

Prefer:

```text
Publish again.
```

Avoid:

```text
Trigger redeployment.
```

---

# 34. Definition of Done

The redesign is complete when a first-time user can:

1. open HelloDeploy
2. click Deploy a Website
3. connect GitHub
4. choose a project
5. allow HelloDeploy to detect configuration
6. enter only missing required settings
7. pass readiness checks
8. publish
9. receive a working HelloDeploy URL
10. connect a custom domain
11. see deployment status
12. recover from a failed deployment
13. restore a previous working version

without needing to understand:

```text
Nginx
PM2
Linux ports
reverse proxies
process IDs
SSL certificate commands
DNS theory
server process management
```

Developers must still be able to access advanced configuration when required.

---

# 35. Final Product Standard

Every HelloDeploy workflow should pass this question:

> Can a person who knows how to create a website but knows nothing about Linux servers understand what to do next?

If the answer is no, simplify the workflow or let HelloDeploy perform that infrastructure step automatically.

The product should not remove technical power.

It should move technical complexity behind the interface until the user actually needs it.
