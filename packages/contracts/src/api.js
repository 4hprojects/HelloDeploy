/**
 * API contract constants — error codes, response shapes.
 *
 * @module @hellodeploy/contracts/api
 */

/** Stable API error codes — include in every error response */
export const ApiError = Object.freeze({
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  RECENT_AUTH_REQUIRED: 'RECENT_AUTH_REQUIRED',
  ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Operations
  DEPLOYMENT_IN_PROGRESS: 'DEPLOYMENT_IN_PROGRESS',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  PROJECT_SUSPENDED: 'PROJECT_SUSPENDED',
  BUILD_FAILED: 'BUILD_FAILED',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
});

/**
 * Build a standard API success envelope.
 * @param {*} data
 * @param {object} [meta]
 * @returns {{ data: *, meta?: object }}
 */
export function successResponse(data, meta) {
  const envelope = { data };
  if (meta !== undefined) {
    envelope.meta = meta;
  }
  return envelope;
}

/**
 * Build a standard API error envelope.
 * @param {string} code - ApiError constant
 * @param {string} message - Human-readable message (no secrets)
 * @param {object} [details] - Field-level validation errors etc.
 * @returns {{ error: { code: string, message: string, details?: object } }}
 */
export function errorResponse(code, message, details) {
  const error = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { error };
}

/** Standard paginated meta shape */
export function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}
