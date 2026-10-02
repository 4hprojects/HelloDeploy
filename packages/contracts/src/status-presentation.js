import {
  ApprovalStatus,
  DeploymentStatus,
  DomainStatus,
  ProjectStatus,
  UserStatus,
} from './enums.js';

const define = (label, tone, hint, terminal = false) =>
  Object.freeze({ label, tone, hint, terminal });

export const STATUS_PRESENTATION = Object.freeze({
  deployment: Object.freeze({
    [DeploymentStatus.QUEUED]: define(
      'Waiting to start',
      'queued',
      'Waiting for a deployment worker.',
    ),
    [DeploymentStatus.VALIDATING]: define(
      'Checking setup',
      'building',
      'Checking the source and deployment configuration.',
    ),
    [DeploymentStatus.BUILDING]: define(
      'Building app',
      'building',
      'Building the application release.',
    ),
    [DeploymentStatus.DEPLOYING]: define(
      'Publishing',
      'deploying',
      'Starting the release, checking it, and preparing routing.',
    ),
    [DeploymentStatus.HEALTHY]: define(
      'Live',
      'healthy',
      'This release passed its checks and is serving traffic.',
      true,
    ),
    [DeploymentStatus.FAILED]: define(
      'Failed',
      'failed',
      'This release did not become live.',
      true,
    ),
    [DeploymentStatus.CANCELLED]: define(
      'Cancelled',
      'stopped',
      'This deployment was stopped before completion.',
      true,
    ),
    [DeploymentStatus.ROLLED_BACK]: define(
      'Replaced',
      'stopped',
      'Traffic was restored to a previous healthy release.',
      true,
    ),
  }),
  project: Object.freeze({
    [ProjectStatus.DRAFT]: define(
      'Setup incomplete',
      'draft',
      'Finish setup and approval before the first deployment.',
    ),
    [ProjectStatus.ACTIVE]: define(
      'Approved',
      'healthy',
      'This project is approved for deployment.',
    ),
    [ProjectStatus.SUSPENDED]: define(
      'Suspended',
      'suspended',
      'This project is paused by an administrator.',
    ),
    [ProjectStatus.ARCHIVED]: define(
      'Archived',
      'archived',
      'This project is read-only and no longer active.',
      true,
    ),
  }),
  approval: Object.freeze({
    [ApprovalStatus.PENDING]: define(
      'Waiting for review',
      'pending',
      'An administrator has not reviewed this request yet.',
    ),
    [ApprovalStatus.APPROVED]: define(
      'Approved',
      'healthy',
      'The project may proceed to deployment.',
      true,
    ),
    [ApprovalStatus.CHANGES_REQUESTED]: define(
      'Changes requested',
      'failed',
      'Update the requested items and submit again.',
      true,
    ),
    [ApprovalStatus.REJECTED]: define(
      'Rejected',
      'failed',
      'This request cannot proceed in its current form.',
      true,
    ),
  }),
  domain: Object.freeze({
    [DomainStatus.PENDING_VERIFICATION]: define(
      'DNS update needed',
      'pending',
      'Publish the requested DNS record, then check again.',
    ),
    [DomainStatus.VERIFYING]: define(
      'Checking DNS',
      'building',
      'HelloDeploy is checking the public DNS record.',
    ),
    [DomainStatus.VERIFIED]: define(
      'DNS verified',
      'healthy',
      'Ownership is verified and routing can be activated.',
    ),
    [DomainStatus.PENDING_ADMIN_APPROVAL]: define(
      'Waiting for admin',
      'pending',
      'An administrator must approve this domain.',
    ),
    [DomainStatus.ACTIVATING]: define(
      'Activating',
      'deploying',
      'HelloDeploy is enabling public routing.',
    ),
    [DomainStatus.ACTIVE]: define('Active', 'healthy', 'This domain is routed to the application.'),
    [DomainStatus.REMOVING]: define(
      'Removing',
      'stopped',
      'HelloDeploy is removing public routing.',
    ),
    [DomainStatus.FAILED]: define(
      'Needs an update',
      'failed',
      'The last domain operation did not complete.',
    ),
    [DomainStatus.REMOVED]: define(
      'Removed',
      'archived',
      'This domain is no longer assigned.',
      true,
    ),
  }),
  user: Object.freeze({
    [UserStatus.PENDING_VERIFICATION]: define(
      'Email verification needed',
      'pending',
      'The account email has not been verified.',
    ),
    [UserStatus.ACTIVE]: define('Active', 'healthy', 'This account can use the platform.'),
    [UserStatus.SUSPENDED]: define(
      'Suspended',
      'suspended',
      'This account is paused by an administrator.',
    ),
    [UserStatus.ARCHIVED]: define(
      'Archived',
      'archived',
      'This account is no longer active.',
      true,
    ),
  }),
});

export function getStatusPresentation(kind, status) {
  const entry = STATUS_PRESENTATION[kind]?.[status];
  if (entry) {
    return entry;
  }
  const label = String(status ?? 'Unknown')
    .replaceAll('_', ' ')
    .toLowerCase();
  return define(label.charAt(0).toUpperCase() + label.slice(1), 'draft', `Status: ${label}`);
}
