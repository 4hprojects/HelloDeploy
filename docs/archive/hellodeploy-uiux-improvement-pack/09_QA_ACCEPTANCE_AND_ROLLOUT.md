# Phase 9: UI/UX QA, Acceptance, and Rollout

## Objective

Prevent a large UI improvement pass from introducing workflow regressions.

## Test Strategy

Use four layers:

1. Unit/component-level behavior
2. Server-render tests
3. Browser workflow tests
4. Production smoke checks

## 1. Route Render Tests

For each major EJS view, render representative states.

Public:
- landing
- sign in
- create account
- verify email
- legal

Dashboard:
- zero projects
- one healthy project
- failed project
- active deployment

Project:
- setup incomplete
- waiting approval
- changes requested
- deploy ready
- deploying
- live
- failed
- archived

Settings:
- valid values
- validation errors
- missing repo
- custom override

Domain:
- unverified
- verified
- pending approval
- active
- rejected/error

Admin:
- no attention
- pending approvals
- worker disconnected
- queue paused

## 2. Browser Workflow Tests

Critical happy path:

1. Create account
2. Verify
3. Login
4. Create project
5. Connect/select repository
6. Run detection
7. Save configuration
8. Add environment variable
9. Submit approval if enabled
10. Approve as admin
11. Deploy
12. Observe progress
13. Open live app

Critical recovery path:

1. Cause deployment failure using controlled fixture
2. Verify plain-language failure
3. View logs
4. Correct configuration
5. Retry
6. Succeed

Rollback path:

1. Deploy release A
2. Deploy release B
3. Roll back to A
4. Confirm route
5. Confirm UI labels

## 3. Mobile Test Matrix

Widths:
- 320
- 360
- 390
- 768

Pages:
- landing
- auth
- dashboard
- project list
- project overview
- deployment list
- deployment detail/logs
- environment variables
- domains
- admin attention page

Check:
- no clipped CTA
- no inaccessible menu
- no core horizontal scrolling
- dialogs fit viewport
- log viewer remains usable

## 4. Keyboard Test Matrix

For each critical workflow:

- no mouse
- visible focus
- logical order
- Enter/Space activation
- Escape closes overlays
- no trapped focus outside intended modal
- focus restoration
- errors reachable

## 5. Dark Mode Matrix

Test at minimum:

- landing
- auth
- dashboard
- project overview
- failed deployment
- domain pending/active
- forms with errors
- confirm modal
- admin health page

## 6. Visual Regression

Create stable screenshot fixtures for:

- guest landing desktop/mobile
- empty dashboard
- healthy dashboard
- failed project
- project setup
- deployment detail
- settings
- domain verification
- admin attention

Use deterministic fixture data.

Do not use production user data in snapshots.

## 7. Accessibility Automation

Run automated checks where tooling permits, but do not treat them as complete accessibility certification.

Automated checks:
- missing labels
- duplicate IDs
- obvious contrast issues
- landmark structure
- invalid ARIA

Manual remains required for:
- keyboard flow
- focus visibility
- focus order
- live updates
- understandable error recovery

## 8. Performance Verification

Before/after:

- page HTML size
- CSS size
- JS size
- request count
- LCP
- INP
- CLS

Record desktop and mobile.

Reject UI changes that significantly worsen performance without justified value.

## 9. Content Verification

Check every user-facing claim against actual product behavior.

Examples:
- supported runtimes
- automatic deployment behavior
- role permissions
- encryption claims
- rollback capability
- pilot status
- service limits

Do not let marketing copy drift from code.

## 10. Production Release Checklist

Before:
- lint
- format
- unit/integration tests
- UI tests
- expected release SHA recorded
- backup/rollback readiness

Deploy.

After:
- `/health`
- expected SHA
- `/ready`
- landing
- sign in
- one authenticated dashboard path
- admin health
- project subdomain routing
- screenshot comparison
- external DNS check

## 11. Usability Testing

Run 5-task moderated or observed sessions with target users.

Tasks:

1. "Find out whether a React project is supported."
2. "Create a project and connect a repository."
3. "Tell me what you need to do before this project can deploy."
4. "A deployment failed. Find the cause and the next action."
5. "Add a custom domain and tell me what DNS change is required."

Record:
- completion
- hesitation
- wrong navigation
- misunderstood labels
- requests for help
- time on task

Do not coach unless the participant is completely blocked.

## 12. Acceptance Metrics

Suggested initial UX metrics:

First project:
- % of verified users who create a project

Setup:
- % of created projects that complete detection

Activation:
- % of created projects reaching first deployment attempt
- % reaching first healthy deployment

Recovery:
- failed deployment -> successful retry conversion

Efficiency:
- median steps from project create to first deploy
- median time from failed result to recovery action

Support:
- repeated questions indicating unclear workflow

## 13. Rollout Strategy

### Batch 1
Production truth + crawlability + instrumentation

### Batch 2
Public site

### Batch 3
Dashboard and project discovery

### Batch 4
First deploy and deployment detail

### Batch 5
Settings/domains/team

### Batch 6
Admin/responsive/accessibility polish

Do not merge all UI work into one release unless the project already has strong visual-regression and end-to-end coverage.

## Final Acceptance

The full UI/UX improvement is ready when:

- production version is verifiable
- guest experience is understandable
- first deploy has a guided path
- dashboard is operationally useful
- deployment progress updates automatically
- failures have recovery guidance
- advanced settings use progressive disclosure
- mobile workflows remain complete
- keyboard workflows remain complete
- dark mode is verified
- public routes are crawlable
- performance targets are monitored
- representative users can finish the core usability tasks

Repository-local automation and its evidence boundary are recorded in
[IMPLEMENTATION_EVIDENCE.md](IMPLEMENTATION_EVIDENCE.md). “Ready” is not a production
claim until the external and representative-user gates above have actually run.
