import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { createProgressSender, dispatchDeployLogMessage } =
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

describe('createProgressSender', () => {
  function collect() {
    const sent = [];
    const sendProgress = createProgressSender((event, data) => sent.push({ event, data }));
    return { sent, sendProgress };
  }

  it('sends a progress event with the server presentation for a running status', () => {
    const { sent, sendProgress } = collect();

    sendProgress('BUILDING');

    assert.deepEqual(sent, [
      {
        event: 'progress',
        data: {
          status: 'BUILDING',
          presentation: {
            label: 'Building app',
            tone: 'building',
            hint: 'Building the application release.',
          },
        },
      },
    ]);
  });

  it('sends a repeated status only once', () => {
    const { sent, sendProgress } = collect();

    sendProgress('BUILDING');
    sendProgress('BUILDING');

    assert.equal(sent.length, 1);
  });

  it('sends each new status after a change', () => {
    const { sent, sendProgress } = collect();

    sendProgress('BUILDING');
    sendProgress('DEPLOYING');

    assert.deepEqual(
      sent.map(({ data }) => data.status),
      ['BUILDING', 'DEPLOYING'],
    );
  });

  it('never sends a terminal status as progress', () => {
    const { sent, sendProgress } = collect();

    sendProgress('HEALTHY');

    assert.deepEqual(sent, []);
  });

  it('ignores a missing status', () => {
    const { sent, sendProgress } = collect();

    sendProgress(undefined);

    assert.deepEqual(sent, []);
  });
});
