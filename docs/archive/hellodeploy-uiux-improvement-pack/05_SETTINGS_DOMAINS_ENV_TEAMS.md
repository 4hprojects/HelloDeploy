# Phase 5: Settings, Domains, Environment Variables, and Teams

## Objective

Make advanced configuration easier to understand while preserving technical control.

## Settings Information Architecture

Use one settings shell with clear groups.

### General
- project name
- slug
- production branch
- notifications

### Build and Runtime
- detected app type
- build command
- start command
- output directory
- port
- health path

### Deployment
- manual/automatic mode
- build filters
- deploy hook
- cache behavior

### Environment
- environment variables

### Domains
- project subdomain
- custom domains

### Access
- members
- roles
- ownership

### Operations
- maintenance mode

### Danger Zone
- archive
- delete when supported

Do not duplicate settings on unrelated pages unless they are read-only summaries with deep links.

## Progressive Disclosure

Default view should show current values as readable summaries.

Example:

Build command
`npm run build`
[Edit]

Advanced build/runtime settings should not all appear as editable inputs by default.

This reduces accidental changes.

## App Detection vs Manual Override

Clearly distinguish:

Detected configuration

from

Custom override

If the user changes a detected value:

Show:
"Custom value"

Offer:
"Reset to detected value"

## Environment Variables

### List Behavior

Display:
- variable name
- state
- scope when relevant
- last updated
- action

Never display secret value after save.

### Add Variable

Fields:
- Name
- Value

Optional:
- description if supported

Validation:
- invalid characters
- duplicates
- reserved names
- empty name

### Bulk Entry

If implemented later:
support paste of `.env` style text only after strong validation and preview.

Never immediately import without confirmation.

### Destructive Action

Removing a variable should explain:
"The next deployment may fail if the application still requires this variable."

## Domains

Domain workflow should be a visible state machine.

States:

1. Added
2. DNS verification required
3. DNS detected
4. Waiting for admin approval
5. Active
6. Failed/needs update

For each state, show only the next required action.

### DNS Instruction

Show exact record fields:

Type
Name/Host
Value/Target
TTL guidance

Add copy buttons.

### Verification

Button:
Check DNS Again

After click:
show result on same page.

Do not rely only on flash banners.

### Active Domain

Show:
- domain
- verified
- active
- open link
- remove action

### Platform Subdomain

Always show the default `*.hellodeploy.online` URL separately so users understand that custom domain is optional.

## Deploy Hooks

Treat as an advanced automation feature.

Explain:
"A deploy hook is a secret URL that starts a deployment when called."

Actions:
- Generate
- Copy
- Revoke
- Regenerate

After creation:
show the raw token/URL once.

Warn:
"You will not be able to view this secret again."

Do not expose the stored hash.

## Build Filters

Use examples.

Included paths:
`apps/web/**`

Ignored paths:
`docs/**`

Explain precedence if both are configured.

Add validation preview where possible:

"Push would trigger deployment"
or
"Push would be ignored"

## Team Access

### Member List

Show:
- name/email
- role
- joined/invited
- actions

### Role Copy

Owner:
full project control, access management, destructive actions

Maintainer:
deploy and operational configuration

Viewer:
read-only project/deployment access

Use the actual authorization model as source of truth.

### Invite Flow

Field:
Email

Role selector:
with description below selected role

Confirmation:
"Invite email@example.com as Maintainer?"

### Ownership Transfer

Must be visually isolated from ordinary role changes.

Require explicit confirmation.

Prefer reauthentication if available.

## Maintenance Mode

Keep as an operational control.

When off:
"Visitors currently see your application."

When on:
"Visitors currently see the maintenance page."

Preview maintenance message before enable when possible.

## Notifications

Use user-facing choices:

All deployment results
Failures only
No deployment email

Avoid raw enum labels.

## Danger Zone

Separate visually.

Archive:
reversible only if that is true

Delete:
state data-loss consequences precisely if supported

Do not place routine settings next to destructive actions.

## Acceptance Criteria

- Settings use one consistent group structure.
- Common values are readable without entering edit mode.
- Advanced deployment options are not visually equal to common settings.
- Domain setup shows one next action for each state.
- DNS record fields include copy actions.
- Environment variable values never reappear in plaintext after save.
- Custom overrides are distinguishable from detected defaults.
- Role descriptions match actual authorization rules.
- Ownership transfer is visually and behaviorally distinct from role edits.
