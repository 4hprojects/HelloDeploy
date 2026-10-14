import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diagnoseAppOutput } from '../../apps/worker/src/deployment/failure-diagnosis.js';

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
