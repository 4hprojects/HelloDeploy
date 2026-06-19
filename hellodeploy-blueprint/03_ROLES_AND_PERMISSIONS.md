# Roles and Permissions

## Authorization Model

HelloDeploy uses two authorization layers:

1. Platform roles govern access to platform administration.
2. Project roles govern access within a specific project.

Authorization must be checked server-side for every protected action. Hiding a button is not authorization.

## Platform Roles

### Super Admin

- Manage all users, roles, projects, quotas, policies, domains, and deployments
- View platform and server health
- Pause queues and enable maintenance mode
- Assign or revoke Admin role
- Create user-level and project-level quota overrides
- Suspend applications and accounts
- Configure integration credentials
- Review complete audit history, excluding plaintext secrets

### Admin

- Review users and projects
- Approve, reject, or return deployment requests
- Operate deployments according to delegated permissions
- Suspend applications for policy or resource violations
- View operational logs and metrics
- Cannot create Super Admins
- Cannot change platform encryption keys or core integration secrets
- Cannot erase audit history

### User

- Create project drafts within quota
- Connect authorized GitHub repositories
- Request project approval
- Own projects and manage project membership
- Deploy approved applications
- Manage permitted domains and environment variables

## Project Roles

| Capability                   |           Owner            |   Maintainer   | Viewer |
| ---------------------------- | :------------------------: | :------------: | :----: |
| View project                 |            Yes             |      Yes       |  Yes   |
| View status and metrics      |            Yes             |      Yes       |  Yes   |
| View sanitized logs          |            Yes             |      Yes       |  Yes   |
| Trigger manual deployment    |            Yes             |      Yes       |   No   |
| Cancel own queued deployment |            Yes             |      Yes       |   No   |
| Restart application          |            Yes             |      Yes       |   No   |
| Stop application             |            Yes             |  Configurable  |   No   |
| Roll back release            |            Yes             |      Yes       |   No   |
| Change deployment mode       |            Yes             |       No       |   No   |
| Change production branch     |    Yes, review required    |       No       |   No   |
| Manage environment variables |            Yes             | Optional grant |   No   |
| Manage domains               |            Yes             |       No       |   No   |
| Invite or remove members     |            Yes             |       No       |   No   |
| Transfer ownership           |            Yes             |       No       |   No   |
| Archive project              |            Yes             |       No       |   No   |
| Delete project               | Yes, confirmation required |       No       |   No   |

## Account and Project Status Effects

- Suspended account: cannot authenticate or trigger deployments; running applications follow Admin decision.
- Suspended project: application is stopped and deployments are blocked.
- Archived project: configuration retained, application stopped, routes disabled.
- Rejected project: draft remains editable unless policy requires removal.
- Maintenance mode: only Super Admin operations and safe read-only access remain available.

## Sensitive Data Rules

- Viewers never see environment-variable values.
- Maintainers see secret names but not values by default.
- Owners may replace values but the interface should not reveal stored plaintext.
- Admins and Super Admins should replace secrets rather than reveal them.
- Every secret mutation creates an audit event without recording the value.

## Privileged Action Controls

Require recent authentication and explicit confirmation for:

- Role changes
- Ownership transfer
- Project deletion
- Account deletion
- Domain removal from a live project
- Quota reduction below current consumption
- Secret replacement
- Audit export
- Maintenance mode
- Infrastructure restart

## Audit Event Minimum Fields

- Actor ID and effective role
- Action
- Target type and ID
- Timestamp
- Source IP or trusted proxy-derived client IP
- User agent when relevant
- Outcome
- Reason or administrative note
- Correlation ID
- Redacted before-and-after metadata for configuration changes
