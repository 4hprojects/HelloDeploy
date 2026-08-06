import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { trackPendingStoreWrites } from '../../apps/web/src/middleware/session.js';

describe('session store pending-write tracking', () => {
  it('resolves immediately when nothing is pending', async () => {
    const store = { set: (sid, sess, callback) => callback(null) };
    const { drain } = trackPendingStoreWrites(store);

    await assert.doesNotReject(drain());
  });

  it('waits for an in-flight write to settle before resolving', async () => {
    const store = {};
    let releaseWrite;
    store.set = (sid, sess, callback) => {
      releaseWrite = () => callback(null);
    };
    const { drain } = trackPendingStoreWrites(store);

    store.set('sid', {}, () => {});
    let drained = false;
    const drainPromise = drain().then(() => {
      drained = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drained, false);

    releaseWrite();
    await drainPromise;
    assert.equal(drained, true);
  });

  it('never alters the original callback arguments', async () => {
    const store = { touch: (sid, sess, callback) => callback(null, { touched: true }) };
    const { drain } = trackPendingStoreWrites(store);

    const received = await new Promise((resolve) => {
      store.touch('sid', {}, (err, result) => resolve({ err, result }));
    });
    await drain();

    assert.deepEqual(received, { err: null, result: { touched: true } });
  });
});
