/**
 * HelloDeploy shared status enums.
 * Use these constants everywhere — never inline string literals for status values.
 *
 * @module @hellodeploy/contracts/enums
 */

/** Platform-level role for the User collection */
export const PlatformRole = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER',
});

/** Project-scoped membership role */
export const ProjectRole = Object.freeze({
  OWNER: 'OWNER',
  MAINTAINER: 'MAINTAINER',
  VIEWER: 'VIEWER',
});

/** User account lifecycle status */
export const UserStatus = Object.freeze({
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
});

/** Project lifecycle status */
export const ProjectStatus = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
});

/**
 * Deployment lifecycle status.
 * Transitions: QUEUED → VALIDATING → BUILDING → DEPLOYING → HEALTHY
 *              Any stage may transition to FAILED or CANCELLED.
 */
export const DeploymentStatus = Object.freeze({
  QUEUED: 'QUEUED',
  VALIDATING: 'VALIDATING',
  BUILDING: 'BUILDING',
  DEPLOYING: 'DEPLOYING',
  HEALTHY: 'HEALTHY',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  ROLLED_BACK: 'ROLLED_BACK',
});

/** Deployment trigger source */
export const DeploymentTrigger = Object.freeze({
  MANUAL: 'MANUAL',
  AUTOMATIC: 'AUTOMATIC',
  ROLLBACK: 'ROLLBACK',
  SYSTEM: 'SYSTEM',
});

/** Deployment approval state */
export const ApprovalStatus = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

/** Container runtime status */
export const ContainerStatus = Object.freeze({
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
  CRASHED: 'CRASHED',
  REMOVED: 'REMOVED',
});

/** Custom domain verification and activation state */
export const DomainStatus = Object.freeze({
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  PENDING_ADMIN_APPROVAL: 'PENDING_ADMIN_APPROVAL',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  REMOVED: 'REMOVED',
});

/** Domain type */
export const DomainType = Object.freeze({
  PLATFORM_SUBDOMAIN: 'PLATFORM_SUBDOMAIN',
  CUSTOM: 'CUSTOM',
});

/** Quota scope */
export const QuotaScope = Object.freeze({
  PLAN: 'PLAN',
  USER: 'USER',
  PROJECT: 'PROJECT',
});

/** Notification delivery channel */
export const NotificationChannel = Object.freeze({
  EMAIL: 'EMAIL',
  IN_APP: 'IN_APP',
});

/** Notification delivery status */
export const NotificationStatus = Object.freeze({
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
});

/** Audit event outcome */
export const AuditOutcome = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  DENIED: 'DENIED',
});

/** Project deployment trigger mode */
export const DeploymentMode = Object.freeze({
  MANUAL: 'MANUAL',
  AUTOMATIC: 'AUTOMATIC',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
});

/** Detected runtime types (framework detection output) */
export const RuntimeType = Object.freeze({
  STATIC: 'STATIC',
  NODEJS: 'NODEJS',
  EXPRESS: 'EXPRESS',
  REACT: 'REACT',
  VUE: 'VUE',
  NEXTJS: 'NEXTJS',
  UNKNOWN: 'UNKNOWN',
});
