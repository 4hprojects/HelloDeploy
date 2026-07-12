import { JobType } from './jobs.js';

/**
 * Thrown when a dequeued job's payload doesn't match its contract. The web
 * side builds payloads correctly today, but nothing enforced that at the
 * queue boundary — a bug in an enqueue call, a stale job left over from a
 * schema change, or a future caller could otherwise hand the worker a
 * malformed payload that fails deep inside a handler with a confusing error.
 */
export class JobPayloadValidationError extends Error {
  constructor(jobType, message) {
    super(`Invalid ${jobType} payload: ${message}`);
    this.name = 'JobPayloadValidationError';
    this.code = 'JOB_PAYLOAD_INVALID';
    this.jobType = jobType;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function requireString(data, field, jobType) {
  if (!isNonEmptyString(data[field])) {
    throw new JobPayloadValidationError(jobType, `"${field}" must be a non-empty string.`);
  }
}

function requireBoolean(data, field, jobType) {
  if (typeof data[field] !== 'boolean') {
    throw new JobPayloadValidationError(jobType, `"${field}" must be a boolean.`);
  }
}

function requireNumber(data, field, jobType) {
  if (typeof data[field] !== 'number' || Number.isNaN(data[field])) {
    throw new JobPayloadValidationError(jobType, `"${field}" must be a number.`);
  }
}

function requireObject(data, field, jobType) {
  if (typeof data[field] !== 'object' || data[field] === null || Array.isArray(data[field])) {
    throw new JobPayloadValidationError(jobType, `"${field}" must be an object.`);
  }
}

function requireStringArray(data, field, jobType) {
  if (!Array.isArray(data[field]) || data[field].some((value) => !isNonEmptyString(value))) {
    throw new JobPayloadValidationError(jobType, `"${field}" must be an array of strings.`);
  }
}

const VALIDATORS = {
  [JobType.BUILD_DEPLOYMENT](data) {
    for (const field of [
      'projectId',
      'deploymentId',
      'commitSha',
      'repositoryId',
      'runtimeType',
      'imageTag',
    ]) {
      requireString(data, field, JobType.BUILD_DEPLOYMENT);
    }
  },
  [JobType.ACTIVATE_RELEASE](data) {
    for (const field of ['projectId', 'deploymentId']) {
      requireString(data, field, JobType.ACTIVATE_RELEASE);
    }
    if (data.resourceLimits !== undefined) {
      requireObject(data, 'resourceLimits', JobType.ACTIVATE_RELEASE);
    }
  },
  [JobType.ROLLBACK_RELEASE](data) {
    for (const field of ['projectId', 'deploymentId', 'sourceDeploymentId']) {
      requireString(data, field, JobType.ROLLBACK_RELEASE);
    }
  },
  [JobType.VERIFY_DOMAIN](data) {
    for (const field of ['domainId', 'projectId', 'hostname']) {
      requireString(data, field, JobType.VERIFY_DOMAIN);
    }
  },
  [JobType.STOP_PROJECT](data) {
    requireString(data, 'projectId', JobType.STOP_PROJECT);
  },
  [JobType.DELETE_PROJECT](data) {
    requireString(data, 'projectId', JobType.DELETE_PROJECT);
    if (data.version >= 2) {
      requireString(data, 'projectSlug', JobType.DELETE_PROJECT);
      requireStringArray(data, 'containerIds', JobType.DELETE_PROJECT);
      requireStringArray(data, 'imageTags', JobType.DELETE_PROJECT);
    }
  },
  [JobType.SET_PROJECT_MAINTENANCE](data) {
    requireString(data, 'projectId', JobType.SET_PROJECT_MAINTENANCE);
    requireBoolean(data, 'enabled', JobType.SET_PROJECT_MAINTENANCE);
  },
  [JobType.CLEANUP_RELEASES](data) {
    if (data.projectId !== undefined) {
      requireString(data, 'projectId', JobType.CLEANUP_RELEASES);
    }
    if (data.olderThanMs !== undefined) {
      requireNumber(data, 'olderThanMs', JobType.CLEANUP_RELEASES);
    }
  },
};

/**
 * Validate a dequeued job's payload against its contract shape.
 * No-op (does not throw) for job types without a registered validator.
 *
 * @param {string} jobType — a `JobType` value
 * @param {object} data — `job.data`
 * @throws {JobPayloadValidationError}
 */
export function validateJobPayload(jobType, data) {
  const validate = VALIDATORS[jobType];
  if (!validate) {
    return;
  }
  if (typeof data !== 'object' || data === null) {
    throw new JobPayloadValidationError(jobType, 'payload must be an object.');
  }
  validate(data);
}
