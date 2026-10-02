# Phase 6: Admin and Operations UX

## Objective

Help an administrator answer "What requires action right now?" before showing the full management inventory.

## Existing Strengths

The repository's admin audit already improved:

- approval detail
- domain queue
- quota navigation
- suspension reasons
- project search
- actor resolution
- queue confirmation
- MongoDB status
- needs-attention summary

Do not recreate these changes. Build on them.

## Admin Home Hierarchy

### 1. Needs Attention

Show only actionable operational conditions.

Examples:
- approval requests pending
- domain approvals pending
- deployment worker disconnected
- queue paused
- failed jobs above threshold
- database degraded
- platform maintenance mode active

Each item:
- severity
- short explanation
- direct CTA

### 2. Operational Health

Cards:

Web
- Ready / Degraded

MongoDB
- Ready / Degraded

Redis/Queue
- Ready / Degraded

Worker
- Connected / Disconnected

Do not add direct Docker access to the web process merely for UI status. Preserve privilege separation.

### 3. Pending Work

Counts:
- Project approvals
- Domains
- Suspended users/projects if action is expected
- Failed jobs awaiting review

### 4. Recent Admin Activity

Only high-value events:
- approval decision
- suspension
- quota change
- domain decision
- maintenance change
- queue pause/resume

## Approval Review

Keep the current strong detail page.

Potential enhancements:

- summary header with project owner, repository, runtime, branch
- grouped blockers/warnings
- diff of changed settings after previous submission
- direct link to project
- decision reason required for Request Changes
- optional note for Approve

## Domain Approval

Show:

Domain
Project
Owner
DNS verified time
Current public TXT evidence
Requested time

Actions:
Approve
Reject

Require reason for reject.

## User Management

Search and filter remain.

Improve row density:

Name/email
Status
Projects count
Joined
Actions

Actions should use menu if row becomes crowded.

Avoid 4 to 6 equal buttons in each row.

## Project Administration

Search:
name/slug/owner

Filter:
status

Show:
- owner
- status
- last deployment
- quota link
- suspend/reactivate

## Quotas

Present limit and usage together.

Example:

Projects
3 / 5 used

Concurrent deployments
1 / 2

Storage
1.2 GB / 5 GB

Use progress indicators only if they add clarity and have accessible text.

## Audit Events

Keep filtering.

Enhance event row:

Action
Actor
Target
Outcome
Timestamp

Expandable details:
IP
correlation ID
metadata

Do not make raw IDs primary information when human-readable labels exist.

## Server/Operations Page

Separate:

Service Health
Resource Utilization
Deployment Queue
Maintenance Controls

### Resource thresholds

CPU/memory/disk charts should not imply a problem from a single short spike.

Use:
Current
Recent average where feasible
Threshold state

### Queue

Show:
Waiting
Active
Delayed
Failed

Actions:
Pause
Resume

Explain operational consequence.

## Maintenance Controls

Platform maintenance and project maintenance are different.

Use explicit labels:

Platform Maintenance Mode

Do not use only "Maintenance Mode" on admin pages if ambiguity is possible.

## Failure Diagnostics

Admin error panels should include:

- human summary
- timestamp
- correlation ID
- affected component
- retry/recovery action
- link to logs when available

Do not expose secrets.

## Responsive Admin UX

Admin tables are dense.

At narrow widths:

- preserve critical fields
- move secondary fields into expandable row
- convert row actions into one menu
- avoid horizontal scroll for primary tasks

## Acceptance Criteria

- Admin landing page prioritizes actionable work.
- Operational health is separated from management inventory.
- Approval decisions remain contextual and safe.
- Quotas show usage and limit together.
- Admin tables remain usable on tablet.
- Raw identifiers are secondary.
- Web process does not gain Docker privilege for dashboard convenience.
