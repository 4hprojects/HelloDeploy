import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { withProjectRouteLock } from '../../apps/worker/src/nginx/project-route-lock.js';

/** A task that records when it starts and ends, and finishes when released. */
function recordedTask(name, events) {
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: () => finish(),
    run: async () => {
      events.push(`${name} start`);
      await done;
      events.push(`${name} end`);
      return name;
    },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('withProjectRouteLock', () => {
  it('runs route changes for one project one at a time, in order', async () => {
    const events = [];
    const first = recordedTask('first', events);
    const second = recordedTask('second', events);
    const running = [
      withProjectRouteLock('project-a', first.run),
      withProjectRouteLock('project-a', second.run),
    ];
    await tick();
    second.finish();
    first.finish();
    await Promise.all(running);

    assert.deepEqual(events, ['first start', 'first end', 'second start', 'second end']);
  });

  it('lets different projects change routes at the same time', async () => {
    const events = [];
    const first = recordedTask('first', events);
    const second = recordedTask('second', events);
    const running = [
      withProjectRouteLock('project-b', first.run),
      withProjectRouteLock('project-c', second.run),
    ];
    await tick();
    const startedBeforeEitherEnded = [...events];
    first.finish();
    second.finish();
    await Promise.all(running);

    assert.deepEqual(startedBeforeEitherEnded, ['first start', 'second start']);
  });

  it("returns the task's result", async () => {
    assert.equal(await withProjectRouteLock('project-d', async () => 'routed'), 'routed');
  });

  it('releases the lock when a task fails', async () => {
    await assert.rejects(
      withProjectRouteLock('project-e', async () => {
        throw new Error('nginx reload failed');
      }),
    );

    assert.equal(await withProjectRouteLock('project-e', async () => 'next'), 'next');
  });
});
