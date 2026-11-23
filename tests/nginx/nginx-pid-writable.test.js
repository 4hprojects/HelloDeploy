import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const { assertNginxPidWritable } = await import('../../apps/worker/src/nginx/route-manager.js');

describe('assertNginxPidWritable', () => {
  let directory;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hellodeploy-nginx-pid-'));
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts a writable PID file', async () => {
    const pidPath = join(directory, 'writable.pid');
    await writeFile(pidPath, '123\n');

    await assert.doesNotReject(assertNginxPidWritable(pidPath));
  });

  it('rejects a PID file that does not exist, naming the path', async () => {
    const pidPath = join(directory, 'missing.pid');

    await assert.rejects(assertNginxPidWritable(pidPath), {
      message: `Nginx PID file ${pidPath} is not writable (ENOENT); nginx -t would fail.`,
    });
  });

  it('rejects a read-only PID file', { skip: process.getuid?.() === 0 }, async () => {
    const pidPath = join(directory, 'read-only.pid');
    await writeFile(pidPath, '123\n');
    await chmod(pidPath, 0o444);

    await assert.rejects(assertNginxPidWritable(pidPath), /not writable \(EACCES\)/);
  });
});
