/**
 * BullMQ job type names and payload schemas (JSDoc).
 * All worker jobs must conform to these contracts.
 *
 * Payload versioning: increment `version` when adding required fields.
 * Workers must handle current and previous version gracefully.
 *
 * @module @hellodeploy/contracts/jobs
 */

/** Job type identifiers — use these as BullMQ queue/job names */
export const JobType = Object.freeze({
  VALIDATE_PROJECT: 'VALIDATE_PROJECT',
  BUILD_DEPLOYMENT: 'BUILD_DEPLOYMENT',
  ACTIVATE_RELEASE: 'ACTIVATE_RELEASE',
  ROLLBACK_RELEASE: 'ROLLBACK_RELEASE',
  STOP_PROJECT: 'STOP_PROJECT',
  RESTART_PROJECT: 'RESTART_PROJECT',
  DELETE_PROJECT: 'DELETE_PROJECT',
  SET_PROJECT_MAINTENANCE: 'SET_PROJECT_MAINTENANCE',
  VERIFY_DOMAIN: 'VERIFY_DOMAIN',
  CLEANUP_RELEASES: 'CLEANUP_RELEASES',
  COLLECT_METRICS: 'COLLECT_METRICS',
  CHECK_INACTIVITY: 'CHECK_INACTIVITY',
});

/**
 * @typedef {Object} BaseJobPayload
 * @property {number} version        - Payload schema version
 * @property {string} correlationId  - Request trace ID (from web API)
 * @property {string} actorId        - User ID who triggered the job (or 'system')
 * @property {string} actorRole      - PlatformRole of actor
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 *   repositoryId: string;
 *   branch: string;
 *   commitSha: string;
 * }} ValidateProjectPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 *   deploymentId: string;
 *   commitSha: string;
 *   repositoryId: string;
 *   runtimeType: string;
 *   buildArgs?: Record<string, string>;
 *   noCache?: boolean;
 * }} BuildDeploymentPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 *   deploymentId: string;
 *   imageId: string;
 *   targetPort: number;
 *   resourceLimits: {
 *     memoryMb: number;
 *     cpuShares: number;
 *     pidsLimit: number;
 *   };
 * }} ActivateReleasePayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 *   targetDeploymentId: string;
 * }} RollbackReleasePayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 *   reason: string;
 * }} StopProjectPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 * }} RestartProjectPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 * }} DeleteProjectPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId: string;
 *   enabled: boolean;
 *   message?: string;
 * }} SetProjectMaintenancePayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   domainId: string;
 *   projectId: string;
 *   hostname: string;
 * }} VerifyDomainPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId?: string;
 *   olderThanMs?: number;
 * }} CleanupReleasesPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   projectId?: string;
 * }} CollectMetricsPayload
 */

/**
 * @typedef {BaseJobPayload & {
 *   inactivityThresholdDays: number;
 *   suspensionThresholdDays: number;
 * }} CheckInactivityPayload
 */

/** Default retry policies per job type */
export const JobRetryPolicy = Object.freeze({
  [JobType.VALIDATE_PROJECT]: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  [JobType.BUILD_DEPLOYMENT]: { attempts: 1, backoff: { type: 'fixed', delay: 0 } },
  [JobType.ACTIVATE_RELEASE]: { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
  [JobType.ROLLBACK_RELEASE]: { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
  [JobType.STOP_PROJECT]: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  [JobType.RESTART_PROJECT]: { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
  [JobType.DELETE_PROJECT]: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  [JobType.SET_PROJECT_MAINTENANCE]: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  [JobType.VERIFY_DOMAIN]: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  [JobType.CLEANUP_RELEASES]: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  [JobType.COLLECT_METRICS]: { attempts: 2, backoff: { type: 'fixed', delay: 1000 } },
  [JobType.CHECK_INACTIVITY]: { attempts: 2, backoff: { type: 'fixed', delay: 5000 } },
});
