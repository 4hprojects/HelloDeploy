# Data Model and API

## Data Principles

- Use immutable IDs, normalized slugs, and UTC timestamps.
- Store status transitions with timestamps and actor references.
- Soft-delete or archive important records before permanent removal.
- Encrypt secrets with an application encryption key stored outside MongoDB.
- Never use Redis as the durable source of truth.

## Core Collections

### users

Key fields:

- `_id`
- `name`
- `emailNormalized`
- `passwordHash`
- `platformRole`: `SUPER_ADMIN | ADMIN | USER`
- `status`
- `emailVerifiedAt`
- `quotaOverrideId`
- `notificationPreferences`
- `createdAt`, `updatedAt`, `lastLoginAt`

Indexes:

- Unique `emailNormalized`
- `status`
- `platformRole`

### sessions

- `_id`
- `userId`
- `tokenHash`
- `expiresAt`
- `revokedAt`
- `ipHash` or privacy-conscious IP metadata
- `userAgent`

Use a TTL index on `expiresAt`.

### projects

- `_id`
- `name`, `slug`
- `ownerId`
- `status`
- `repositoryId`
- `runtimeType`
- `productionBranch`
- `deploymentMode`
- `buildConfiguration`
- `configurationVersion`
- `platformSubdomain`
- `activeDeploymentId`
- `quotaOverrideId`
- `createdAt`, `updatedAt`, `archivedAt`

Indexes:

- Unique `slug`
- `ownerId`
- `status`
- `activeDeploymentId`

### project_memberships

- `_id`
- `projectId`
- `userId`
- `role`: `OWNER | MAINTAINER | VIEWER`
- Optional permission overrides
- `invitedBy`, `acceptedAt`

Unique compound index on `projectId + userId`.

### repositories

- `_id`
- `projectId`
- GitHub installation and repository identifiers
- Repository full name
- Default and selected branches
- Visibility
- Last observed commit SHA
- Access status and timestamps

Do not store reusable personal access tokens.

### environment_secrets

- `_id`
- `projectId`
- `name`
- `encryptedValue`
- `encryptionVersion`
- `createdBy`, `updatedBy`
- `createdAt`, `updatedAt`

Unique compound index on `projectId + name`.

### deployments

- `_id`
- `projectId`
- `sequenceNumber`
- `triggerType`
- `requestedBy`
- `commitSha`, `commitMessage`
- `configurationVersion`
- `status`
- `currentStage`
- `imageTag`, `imageDigest`
- `candidateContainerId`, `activeContainerId`
- `startedAt`, `completedAt`
- `failureCode`, `failureSummary`
- `sourceDeploymentId` for rollback

Unique compound index on `projectId + sequenceNumber`.

### deployment_events

- `deploymentId`
- `stage`
- `level`
- `messageRedacted`
- `timestamp`
- `correlationId`

Apply retention policy and indexes for ordered retrieval.

### domains

- `_id`
- `projectId`
- `hostnameNormalized`
- `type`: `PLATFORM_SUBDOMAIN | CUSTOM`
- `status`
- `verificationMethod`
- `verificationTokenHash`
- `verifiedAt`, `activatedAt`

Unique `hostnameNormalized` index.

### quotas

- `_id`
- `scopeType`: `PLAN | USER | PROJECT`
- `scopeId`
- Resource values
- `createdBy`
- `reason`
- Effective dates

### audit_events

- Actor, action, target, outcome, reason
- Redacted metadata
- Client and correlation metadata
- Immutable creation timestamp

Audit events must be append-only through the application.

### notifications

- User, channel, template, status, retry count
- Related project or deployment
- Sent and failure timestamps

### server_snapshots

- CPU, memory, disk, load, queue depth, running container count
- Timestamp

Use bounded retention or aggregation.

## API Conventions

- Prefix: `/api/v1`
- JSON request and response bodies
- Schema validation on every mutation
- Pagination for collections
- Correlation ID in every response
- Idempotency key for deployment and destructive operations
- Stable machine-readable error codes

## Endpoint Groups

### Authentication

- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:id`

### Projects

- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `POST /projects/:id/submit-review`
- `POST /projects/:id/archive`
- `DELETE /projects/:id`

### Members

- `GET /projects/:id/members`
- `POST /projects/:id/invitations`
- `PATCH /projects/:id/members/:userId`
- `DELETE /projects/:id/members/:userId`

### GitHub

- `GET /github/installations`
- `GET /github/repositories`
- `POST /github/webhooks`
- `POST /projects/:id/repository`

### Deployments

- `GET /projects/:id/deployments`
- `POST /projects/:id/deployments`
- `POST /deployments/:id/cancel`
- `POST /deployments/:id/retry`
- `POST /projects/:id/rollback`
- `GET /deployments/:id/events`

### Configuration

- `GET /projects/:id/environment-variables`
- `PUT /projects/:id/environment-variables`
- `DELETE /projects/:id/environment-variables/:name`
- `GET /projects/:id/domains`
- `POST /projects/:id/domains`
- `POST /domains/:id/verify`
- `DELETE /domains/:id`

### Administration

- `GET /admin/overview`
- `GET /admin/users`
- `PATCH /admin/users/:id/status`
- `GET /admin/reviews`
- `POST /admin/reviews/:id/decision`
- `PATCH /admin/quotas/:scope/:id`
- `POST /admin/projects/:id/suspend`
- `POST /admin/projects/:id/reactivate`
- `GET /admin/audit-events`
- `GET /admin/server`
- `POST /admin/queue/pause`
- `POST /admin/queue/resume`

## Worker Job Contracts

- `VALIDATE_PROJECT`
- `BUILD_DEPLOYMENT`
- `ACTIVATE_RELEASE`
- `ROLLBACK_RELEASE`
- `STOP_PROJECT`
- `RESTART_PROJECT`
- `VERIFY_DOMAIN`
- `CLEANUP_RELEASES`
- `COLLECT_METRICS`
- `CHECK_INACTIVITY`

Each job includes a versioned payload, actor or system origin, correlation ID, retry policy, and idempotency key.
