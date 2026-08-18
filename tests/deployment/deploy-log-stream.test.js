import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { dispatchDeployLogMessage } =
  await import('../../apps/web/src/services/deploy-log-stream.js');

describe('dispatchDeployLogMessage', () => {
  it('calls every handler subscribed to the message channel', () => {
    const received = [];
    const handlers = new Map([['deploy-logs:1', new Set([(payload) => received.push(payload)])]]);

    dispatchDeployLogMessage('deploy-logs:1', JSON.stringify({ type: 'log' }), handlers);

    assert.deepEqual(received, [{ type: 'log' }]);
  });

  it('does not call handlers subscribed to a different channel', () => {
    const received = [];
    const handlers = new Map([
      ['deploy-logs:other', new Set([(payload) => received.push(payload)])],
    ]);

    dispatchDeployLogMessage('deploy-logs:1', JSON.stringify({ type: 'log' }), handlers);

    assert.deepEqual(received, []);
  });

  it('isolates a throwing handler so sibling handlers still run', () => {
    const received = [];
    const handlers = new Map([
      [
        'deploy-logs:1',
        new Set([
          () => {
            throw new Error('boom');
          },
          (payload) => received.push(payload),
        ]),
      ],
    ]);

    dispatchDeployLogMessage('deploy-logs:1', JSON.stringify({ type: 'log' }), handlers);

    assert.deepEqual(received, [{ type: 'log' }]);
  });

  it('drops malformed JSON without calling any handler', () => {
    const received = [];
    const handlers = new Map([['deploy-logs:1', new Set([(payload) => received.push(payload)])]]);

    dispatchDeployLogMessage('deploy-logs:1', 'not-json', handlers);

    assert.deepEqual(received, []);
  });
});
