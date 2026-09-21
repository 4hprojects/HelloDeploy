import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asyncHandler } from '../../apps/web/src/utils/async-handler.js';

describe('asyncHandler', () => {
  it('forwards a rejected promise to the error middleware', async () => {
    const boom = new Error('boom');
    let forwarded = null;
    await asyncHandler(async () => {
      throw boom;
    })({}, {}, (err) => {
      forwarded = err;
    });
    assert.equal(forwarded, boom);
  });

  // The wrapper calls fn() before Promise.resolve can wrap it, so a synchronous
  // throw escapes rather than reaching next(). That is not a gap: Express
  // catches synchronous throws in handlers itself. Pinned so the boundary is
  // explicit if the wrapper is ever rewritten.
  it('lets a synchronous throw propagate for Express to catch', async () => {
    await assert.rejects(async () =>
      asyncHandler(() => {
        throw new Error('sync boom');
      })({}, {}, () => {}),
    );
  });

  it('does not invoke next when the handler resolves', async () => {
    let nextCalled = false;
    await asyncHandler(async () => 'ok')({}, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
  });

  it('passes the request, response and next through to the handler', async () => {
    const req = { id: 'req' };
    const res = { id: 'res' };
    let seen = null;
    await asyncHandler(async (a, b) => {
      seen = { a, b };
    })(req, res, () => {});
    assert.deepEqual(seen, { a: req, b: res });
  });
});
