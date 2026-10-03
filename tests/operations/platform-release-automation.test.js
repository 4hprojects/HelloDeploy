import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { PlatformReleaseRequest } from '@hellodeploy/database';
import { PlatformReleaseStatus, PlatformRole } from '@hellodeploy/contracts';
import { env } from '../../apps/web/src/config/env.js';
import {
  applyPlatformReleaseCallback,
  getLatestReleaseCandidate,
  requestPlatformRelease,
} from '../../apps/web/src/services/platform-release.service.js';
import {
  approvalObjectId,
  clearApprovalTestDb,
  startApprovalTestDb,
  stopApprovalTestDb,
} from '../helpers/approval-db.js';

const SHA = 'b'.repeat(40);
const SECRET = 'release-callback-secret-for-tests';
const tokenLoader = async () => 'github-test-token';

function response(status, body = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function githubFetch({ checksPassed = true, checkRuns, dispatchStatus = 204 } = {}) {
  return async (url, options = {}) => {
    if (url.endsWith('/commits/main')) {
      return response(200, { sha: SHA });
    }
    if (url.includes('/check-runs')) {
      return response(200, {
        check_runs:
          checkRuns ??
          ['Lint & Test (22.x)', 'CodeQL Analysis (javascript-typescript)'].map((name) => ({
            name,
            status: 'completed',
            conclusion: checksPassed ? 'success' : 'failure',
            completed_at: '2026-10-02T00:00:00Z',
          })),
      });
    }
    if (url.includes('/dispatches') && options.method === 'POST') {
      return response(dispatchStatus);
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
}

function callback(request, status, sequence, failureCode = null) {
  const body = Buffer.from(
    JSON.stringify({
      requestId: request._id.toString(),
      releaseSha: request.candidateSha,
      status,
      sequence,
      runId: 12345,
      failureCode,
    }),
  );
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${createHmac('sha256', SECRET)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex')}`;
  return { requestId: request._id.toString(), rawBody: body, timestamp, signature };
}

describe('platform release automation', () => {
  before(async () => {
    env.PLATFORM_RELEASE_AUTOMATION_ENABLED = true;
    env.PLATFORM_RELEASE_GITHUB_REPOSITORY = '4hprojects/HelloDeploy';
    env.PLATFORM_RELEASE_WORKFLOW_FILE = 'deploy-production.yml';
    env.PLATFORM_RELEASE_CALLBACK_SECRET = SECRET;
    await startApprovalTestDb();
  });
  after(async () => {
    await stopApprovalTestDb();
  });
  beforeEach(clearApprovalTestDb);

  it('discovers only a latest main commit with every required check passing', async () => {
    const ready = await getLatestReleaseCandidate({ fetchImpl: githubFetch(), tokenLoader });
    assert.equal(ready.sha, SHA);
    assert.equal(ready.eligible, true);

    const failed = await getLatestReleaseCandidate({
      fetchImpl: githubFetch({ checksPassed: false }),
      tokenLoader,
    });
    assert.equal(failed.eligible, false);
  });

  it('rejects an older passing check when the newest completed run failed', async () => {
    const checkRuns = ['Lint & Test (22.x)', 'CodeQL Analysis (javascript-typescript)'].flatMap(
      (name) => [
        {
          name,
          status: 'completed',
          conclusion: 'success',
          completed_at: '2026-10-02T00:00:00Z',
        },
        {
          name,
          status: 'completed',
          conclusion: 'failure',
          completed_at: '2026-10-03T00:00:00Z',
        },
      ],
    );
    const candidate = await getLatestReleaseCandidate({
      fetchImpl: githubFetch({ checkRuns }),
      tokenLoader,
    });
    assert.equal(candidate.eligible, false);
    assert.ok(candidate.checks.every((check) => check.conclusion === 'failure'));
  });

  it('uses the greater check-run ID when completed timestamps are equal', async () => {
    const checkRuns = ['Lint & Test (22.x)', 'CodeQL Analysis (javascript-typescript)'].flatMap(
      (name) => [
        {
          id: 10,
          name,
          status: 'completed',
          conclusion: 'success',
          completed_at: '2026-10-03T00:00:00Z',
        },
        {
          id: 11,
          name,
          status: 'completed',
          conclusion: 'failure',
          completed_at: '2026-10-03T00:00:00Z',
        },
      ],
    );
    const candidate = await getLatestReleaseCandidate({
      fetchImpl: githubFetch({ checkRuns }),
      tokenLoader,
    });
    assert.equal(candidate.eligible, false);
    assert.ok(candidate.checks.every((check) => check.conclusion === 'failure'));
  });

  it('dispatches the exact eligible candidate and prevents concurrent releases', async () => {
    const first = await requestPlatformRelease({
      candidateSha: SHA,
      requestedBy: approvalObjectId(),
      actorRole: PlatformRole.SUPER_ADMIN,
      fetchImpl: githubFetch(),
      tokenLoader,
    });
    assert.equal(first.success, true);
    assert.equal(first.request.status, PlatformReleaseStatus.DISPATCHED);

    const second = await requestPlatformRelease({
      candidateSha: SHA,
      requestedBy: approvalObjectId(),
      actorRole: PlatformRole.SUPER_ADMIN,
      fetchImpl: githubFetch(),
      tokenLoader,
    });
    assert.equal(second.success, false);
    assert.match(second.error, /already in progress/i);
  });

  it('rejects stale candidates, failed checks, and non-Super-Admins', async () => {
    const common = {
      requestedBy: approvalObjectId(),
      actorRole: PlatformRole.SUPER_ADMIN,
      fetchImpl: githubFetch(),
      tokenLoader,
    };
    assert.equal(
      (await requestPlatformRelease({ ...common, candidateSha: 'a'.repeat(40) })).success,
      false,
    );
    assert.equal(
      (
        await requestPlatformRelease({
          ...common,
          candidateSha: SHA,
          fetchImpl: githubFetch({ checksPassed: false }),
        })
      ).success,
      false,
    );
    assert.equal(
      (
        await requestPlatformRelease({
          ...common,
          candidateSha: SHA,
          actorRole: PlatformRole.ADMIN,
        })
      ).success,
      false,
    );
  });

  it('marks dispatch failures terminal and releases the concurrency lock', async () => {
    const result = await requestPlatformRelease({
      candidateSha: SHA,
      requestedBy: approvalObjectId(),
      actorRole: PlatformRole.SUPER_ADMIN,
      fetchImpl: githubFetch({ dispatchStatus: 500 }),
      tokenLoader,
    });
    assert.equal(result.success, false);
    const saved = await PlatformReleaseRequest.findOne().lean();
    assert.equal(saved.status, PlatformReleaseStatus.DISPATCH_FAILED);
    assert.equal(saved.activeLock, null);
  });

  it('accepts signed monotonic callbacks and rejects replay or mismatched signatures', async () => {
    const request = await PlatformReleaseRequest.create({
      candidateSha: SHA,
      requestedBy: approvalObjectId(),
      status: PlatformReleaseStatus.DISPATCHED,
    });
    const running = await applyPlatformReleaseCallback(
      callback(request, PlatformReleaseStatus.RUNNING, 1),
    );
    assert.equal(running.success, true);

    const replay = await applyPlatformReleaseCallback(
      callback(request, PlatformReleaseStatus.RUNNING, 1),
    );
    assert.equal(replay.statusCode, 409);

    const invalid = callback(request, PlatformReleaseStatus.SUCCEEDED, 2);
    invalid.signature = 'sha256=invalid';
    assert.equal((await applyPlatformReleaseCallback(invalid)).statusCode, 401);

    const expired = callback(request, PlatformReleaseStatus.SUCCEEDED, 2);
    expired.timestamp = '1';
    assert.equal((await applyPlatformReleaseCallback(expired)).statusCode, 401);

    const mismatch = callback(request, PlatformReleaseStatus.SUCCEEDED, 2);
    const mismatchBody = JSON.parse(mismatch.rawBody.toString('utf8'));
    mismatchBody.releaseSha = 'c'.repeat(40);
    mismatch.rawBody = Buffer.from(JSON.stringify(mismatchBody));
    mismatch.signature = `sha256=${createHmac('sha256', SECRET)
      .update(`${mismatch.timestamp}.`)
      .update(mismatch.rawBody)
      .digest('hex')}`;
    assert.equal((await applyPlatformReleaseCallback(mismatch)).statusCode, 404);

    const completed = await applyPlatformReleaseCallback(
      callback(request, PlatformReleaseStatus.ROLLED_BACK, 2, 'ROLLBACK_VERIFIED'),
    );
    assert.equal(completed.success, true);
    assert.equal(completed.request.activeLock, null);

    const invalidTransition = await applyPlatformReleaseCallback(
      callback(request, PlatformReleaseStatus.SUCCEEDED, 3),
    );
    assert.equal(invalidTransition.statusCode, 409);
  });

  it('atomically rejects concurrent callbacks and status-mismatched failure codes', async () => {
    const request = await PlatformReleaseRequest.create({
      candidateSha: SHA,
      requestedBy: approvalObjectId(),
      status: PlatformReleaseStatus.DISPATCHED,
    });
    const concurrent = await Promise.all([
      applyPlatformReleaseCallback(callback(request, PlatformReleaseStatus.RUNNING, 1)),
      applyPlatformReleaseCallback(callback(request, PlatformReleaseStatus.RUNNING, 1)),
    ]);
    assert.equal(concurrent.filter((result) => result.success).length, 1);
    assert.equal(concurrent.filter((result) => result.statusCode === 409).length, 1);

    const invalidFailureCode = await applyPlatformReleaseCallback(
      callback(request, PlatformReleaseStatus.SUCCEEDED, 2, 'ROLLBACK_FAILED'),
    );
    assert.equal(invalidFailureCode.statusCode, 400);
  });
});
