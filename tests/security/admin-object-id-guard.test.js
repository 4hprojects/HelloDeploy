import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateObjectId } from '../../apps/web/src/middleware/validate-object-id.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  return {
    _status: null,
    _view: null,
    status(code) {
      this._status = code;
      return this;
    },
    render(view) {
      this._view = view;
      return this;
    },
  };
}

function run(value) {
  const res = makeRes();
  let nextCalled = false;
  validateObjectId(
    {},
    res,
    () => {
      nextCalled = true;
    },
    value,
  );
  return { res, nextCalled };
}

// ─── Guard behavior ───────────────────────────────────────────────────────────

describe('admin route ObjectId guard', () => {
  it('passes a valid ObjectId through to the route handler', () => {
    const { nextCalled } = run('64b7f8e2a1c9d4f5b6a7c8d9');
    assert.equal(nextCalled, true, 'next() must be called for a valid ObjectId');
  });

  it('does not write a response for a valid ObjectId', () => {
    const { res } = run('64b7f8e2a1c9d4f5b6a7c8d9');
    assert.equal(res._status, null, 'no status must be written for a valid ObjectId');
  });

  it('responds 404 for a non-ObjectId param', () => {
    const { res } = run('not-an-object-id');
    assert.equal(res._status, 404, 'invalid ObjectId must yield 404, not a CastError 500');
  });

  it('renders the standard 404 page for a non-ObjectId param', () => {
    const { res } = run('not-an-object-id');
    assert.equal(res._view, 'pages/404');
  });

  it('does not call next() for a non-ObjectId param', () => {
    const { nextCalled } = run("' OR 1=1 --");
    assert.equal(nextCalled, false, 'invalid values must never reach the route handler');
  });
});
