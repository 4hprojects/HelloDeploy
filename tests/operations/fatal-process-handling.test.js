import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installFatalProcessHandlers } from '@hellodeploy/observability';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function createHarness() {
  const processRef = new EventEmitter();
  const exits = [];
  const logs = [];
  processRef.exit = (code) => exits.push(code);
  const logger = { error: (message, metadata) => logs.push({ message, metadata }) };
  const handlers = installFatalProcessHandlers({ service: 'test-service', logger, processRef });
  return { processRef, exits, logs, handlers };
}

describe('fatal process handling', () => {
  it('logs a sanitized classification and exits on uncaught exceptions', () => {
    const harness = createHarness();
    const error = new Error('redis://user:secret@internal-host:6379');
    error.code = 'ECONNREFUSED';

    harness.processRef.emit('uncaughtException', error);

    assert.deepEqual(harness.exits, [1]);
    assert.deepEqual(harness.logs, [
      {
        message: 'test-service: fatal process failure',
        metadata: {
          event: 'uncaughtException',
          errorType: 'Error',
          errorCode: 'ECONNREFUSED',
        },
      },
    ]);
    assert.doesNotMatch(JSON.stringify(harness.logs), /secret|internal-host/);
    harness.handlers.uninstall();
  });

  it('handles unhandled non-Error rejections without logging their value', () => {
    const harness = createHarness();

    harness.processRef.emit('unhandledRejection', 'private-token-value');

    assert.deepEqual(harness.exits, [1]);
    assert.equal(harness.logs[0].metadata.errorType, 'NonErrorFailure');
    assert.doesNotMatch(JSON.stringify(harness.logs), /private-token-value/);
    harness.handlers.uninstall();
  });

  it('terminates only once when fatal events repeat', () => {
    const harness = createHarness();

    harness.processRef.emit('uncaughtException', new Error('first'));
    harness.processRef.emit('unhandledRejection', new Error('second'));

    assert.deepEqual(harness.exits, [1]);
    assert.equal(harness.logs.length, 1);
    harness.handlers.uninstall();
  });

  for (const entrypoint of ['apps/web/src/server.js', 'apps/worker/src/worker.js']) {
    it(`sanitizes configuration-time startup failures in ${entrypoint}`, () => {
      const result = spawnSync(process.execPath, [entrypoint], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          DOTENV_CONFIG_PATH: '/nonexistent/hellodeploy-test-env',
        },
      });
      const output = `${result.stdout}${result.stderr}`;

      assert.equal(result.status, 1);
      assert.match(output, /fatal process failure/);
      assert.match(output, /"event":"startup"/);
      assert.doesNotMatch(output, /Missing required|env-validation\.js|at file:/);
    });
  }
});
