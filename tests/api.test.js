import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { successResponse, errorResponse, paginationMeta, ApiError } from '@hellodeploy/contracts';

describe('contracts — API helpers', () => {
  it('successResponse wraps data', () => {
    const result = successResponse({ id: '1' });
    assert.deepEqual(result, { data: { id: '1' } });
  });

  it('successResponse includes meta when provided', () => {
    const result = successResponse([], { total: 0 });
    assert.ok('meta' in result);
    assert.equal(result.meta.total, 0);
  });

  it('errorResponse wraps error with code and message', () => {
    const result = errorResponse(ApiError.NOT_FOUND, 'Resource not found');
    assert.equal(result.error.code, 'NOT_FOUND');
    assert.equal(result.error.message, 'Resource not found');
  });

  it('errorResponse includes details when provided', () => {
    const result = errorResponse(ApiError.VALIDATION_FAILED, 'Invalid', { field: 'email' });
    assert.deepEqual(result.error.details, { field: 'email' });
  });

  it('paginationMeta computes pages correctly', () => {
    const meta = paginationMeta({ page: 1, limit: 10, total: 25 });
    assert.equal(meta.pages, 3);
    assert.equal(meta.total, 25);
  });
});
