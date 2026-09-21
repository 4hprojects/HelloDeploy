import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JobType, JobRetryPolicy } from '@hellodeploy/contracts';
import { validateJobPayload } from '@hellodeploy/contracts';

const { registerMaintenanceSchedulers, MAINTENANCE_SCHEDULER_ID } =
  await import('../../apps/worker/src/queue/maintenance-scheduler.js');

function makeQueueStub() {
  const calls = [];
  return {
    calls,
    queue: {
      upsertJobScheduler: async (id, repeatOpts, template) => {
        calls.push({ id, repeatOpts, template });
      },
    },
  };
}

describe('maintenance scheduler', () => {
  it('schedules the cleanup sweep at the requested interval', async () => {
    const { calls, queue } = makeQueueStub();
    await registerMaintenanceSchedulers(queue, { intervalMs: 86_400_000 });
    assert.deepEqual(calls[0].repeatOpts, { every: 86_400_000 });
  });

  it('registers under a stable id so re-registering updates in place', async () => {
    const { calls, queue } = makeQueueStub();
    await registerMaintenanceSchedulers(queue, { intervalMs: 1000 });
    await registerMaintenanceSchedulers(queue, { intervalMs: 2000 });
    assert.deepEqual(
      calls.map((c) => c.id),
      [MAINTENANCE_SCHEDULER_ID, MAINTENANCE_SCHEDULER_ID],
    );
  });

  it('names the job so the worker dispatch switch matches it', async () => {
    const { calls, queue } = makeQueueStub();
    await registerMaintenanceSchedulers(queue, { intervalMs: 1000 });
    assert.equal(calls[0].template.name, JobType.CLEANUP_RELEASES);
  });

  it('applies the shared retry policy that upsertJobScheduler would otherwise skip', async () => {
    const { calls, queue } = makeQueueStub();
    await registerMaintenanceSchedulers(queue, { intervalMs: 1000 });
    assert.deepEqual(calls[0].template.opts, {
      attempts: JobRetryPolicy[JobType.CLEANUP_RELEASES].attempts,
      backoff: JobRetryPolicy[JobType.CLEANUP_RELEASES].backoff,
    });
  });

  it('emits a payload the job validator accepts', async () => {
    const { calls, queue } = makeQueueStub();
    await registerMaintenanceSchedulers(queue, { intervalMs: 1000 });
    assert.doesNotThrow(() => validateJobPayload(JobType.CLEANUP_RELEASES, calls[0].template.data));
  });

  it('sweeps every project by omitting a projectId', async () => {
    const { calls, queue } = makeQueueStub();
    await registerMaintenanceSchedulers(queue, { intervalMs: 1000 });
    assert.equal(calls[0].template.data.projectId, undefined);
  });
});
