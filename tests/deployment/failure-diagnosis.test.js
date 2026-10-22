import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyAppLine,
  collapseRepeatedLines,
  diagnoseAppOutput,
  summarizeAppError,
} from '../../apps/worker/src/deployment/failure-diagnosis.js';

// Lines below are real app output from helloeventhub deployments on 2026-10-14.
const MONGO_REFUSED =
  'error: MongoNetworkError: connect ECONNREFUSED ::1:27017, connect ECONNREFUSED 127.0.0.1:27017';
const LISTENING_3009 =
  '{"level":30,"time":1791962502059,"service":"helloeventhub-api","port":3009,"msg":"HelloEventHub listening"}';
const MISSING_DIST = "Error: Cannot find module '/app/apps/api/dist/server.js'";

describe('diagnoseAppOutput', () => {
  it('blames a database address that points at the container itself', () => {
    assert.equal(
      diagnoseAppOutput([MONGO_REFUSED], { appPort: 3000 })?.failureCode,
      'APP_DATABASE_UNREACHABLE',
    );
  });

  it('names the local address the app tried to reach', () => {
    assert.match(diagnoseAppOutput([MONGO_REFUSED], { appPort: 3000 }).detail, /::1:27017/);
  });

  it('reports the port the app listens on when it differs from the expected one', () => {
    assert.match(
      diagnoseAppOutput([LISTENING_3009], { appPort: 3000 }).detail,
      /listening on port 3009, but HelloDeploy expects port 3000/,
    );
  });

  it('accepts an app that listens on the expected port', () => {
    assert.equal(diagnoseAppOutput([LISTENING_3009], { appPort: 3009 }), null);
  });

  it('reads the port from a listening URL', () => {
    assert.equal(
      diagnoseAppOutput(['Server listening on http://0.0.0.0:8080'], { appPort: 3000 })
        ?.failureCode,
      'APP_PORT_MISMATCH',
    );
  });

  it('points a missing compiled entry file at the build command', () => {
    assert.equal(
      diagnoseAppOutput([MISSING_DIST, "code: 'MODULE_NOT_FOUND',"], { appPort: 3000 })
        ?.failureCode,
      'APP_BUILD_OUTPUT_MISSING',
    );
  });

  it('returns null for output it does not recognize', () => {
    assert.equal(diagnoseAppOutput(['Error: MONGODB_URI is not set'], { appPort: 3000 }), null);
  });
});

// helloeventhub deployment #22 on 2026-10-15: the app refused to start because
// its configured event did not exist. One crash, as Docker printed it.
const SLUG_CRASH = [
  '{"level":30,"time":1792085181011,"service":"helloeventhub-api","msg":"database connected, indexes ensured"}',
  'file:///app/apps/api/dist/server.js:4290',
  '    throw new Error(',
  '          ^',
  'Error: PRIMARY_EVENT_SLUG="alsem-reunion-2026" does not identify a published event. Correct the deployment configuration before starting.',
  '    at assertPublishedPrimaryEvent (file:///app/apps/api/dist/server.js:4290:11)',
  'Node.js v22.23.3',
];

describe('summarizeAppError', () => {
  it("reports the app's own error with the environment value hidden and the variable named", () => {
    assert.equal(
      summarizeAppError(SLUG_CRASH, { PRIMARY_EVENT_SLUG: 'alsem-reunion-2026' }),
      'PRIMARY_EVENT_SLUG="[value of PRIMARY_EVENT_SLUG]" does not identify a published event. Correct the deployment configuration before starting. (This refers to PRIMARY_EVENT_SLUG, one of your environment variables. Check its value on the Environment page.)',
    );
  });

  it('names a variable whose value appears without its name', () => {
    const summary = summarizeAppError(['MongoServerError: no database at cluster0.example.net'], {
      DATABASE_HOST: 'cluster0.example.net',
    });
    assert.equal(
      summary,
      'MongoServerError: no database at [value of DATABASE_HOST] (This refers to DATABASE_HOST, one of your environment variables. Check its value on the Environment page.)',
    );
  });

  it('matches a variable name only as a whole word', () => {
    assert.equal(
      summarizeAppError(['Error: EVENT_SLUG_LIST is empty'], { EVENT_SLUG: 'reunion' }),
      'EVENT_SLUG_LIST is empty',
    );
  });

  it('takes the message of a structured error line', () => {
    assert.equal(
      summarizeAppError(['{"level":50,"msg":"payments key rejected"}'], {}),
      'payments key rejected',
    );
  });

  it('returns null when the app printed no error', () => {
    assert.equal(summarizeAppError([SLUG_CRASH[0]], {}), null);
  });
});

describe('classifyAppLine', () => {
  it('keeps the info level of a structured line', () => {
    assert.equal(classifyAppLine(SLUG_CRASH[0]), 'INFO');
  });

  it('treats a stack frame as part of the error', () => {
    assert.equal(classifyAppLine(SLUG_CRASH[5]), 'ERROR');
  });

  it('treats unstructured chatter as info', () => {
    assert.equal(classifyAppLine('Seeding cache'), 'INFO');
  });
});

describe('collapseRepeatedLines', () => {
  it('keeps one copy of a crash Docker printed once per restart', () => {
    const { lines, repeats } = collapseRepeatedLines([...SLUG_CRASH, ...SLUG_CRASH, ...SLUG_CRASH]);
    assert.deepEqual({ count: lines.length, repeats }, { count: SLUG_CRASH.length, repeats: 3 });
  });
});
