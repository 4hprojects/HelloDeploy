import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mongoose, PlatformReleaseRequest } from '@hellodeploy/database';
import { AuditOutcome, PlatformReleaseStatus, PlatformRole } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { env } from '../config/env.js';
import { releaseSha } from '../utils/release-sha.js';

export const REQUIRED_RELEASE_CHECKS = Object.freeze([
  'Lint & Test (22.x)',
  'CodeQL Analysis (javascript-typescript)',
]);
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const ACTIVE_STATUSES = [
  PlatformReleaseStatus.REQUESTED,
  PlatformReleaseStatus.DISPATCHED,
  PlatformReleaseStatus.RUNNING,
];
const FINAL_STATUSES = new Set([
  PlatformReleaseStatus.SUCCEEDED,
  PlatformReleaseStatus.ROLLED_BACK,
  PlatformReleaseStatus.FAILED,
]);
const FAILURE_CODES = new Set([
  'QUALIFICATION_FAILED',
  'DEPLOYMENT_FAILED',
  'ROLLBACK_VERIFIED',
  'ROLLBACK_FAILED',
]);
const FAILURE_CODES_BY_STATUS = Object.freeze({
  [PlatformReleaseStatus.RUNNING]: new Set([null]),
  [PlatformReleaseStatus.SUCCEEDED]: new Set([null]),
  [PlatformReleaseStatus.ROLLED_BACK]: new Set(['ROLLBACK_VERIFIED']),
  [PlatformReleaseStatus.FAILED]: new Set([
    'QUALIFICATION_FAILED',
    'DEPLOYMENT_FAILED',
    'ROLLBACK_FAILED',
  ]),
});
const TRANSITIONS = Object.freeze({
  [PlatformReleaseStatus.DISPATCHED]: new Set([
    PlatformReleaseStatus.RUNNING,
    PlatformReleaseStatus.FAILED,
  ]),
  [PlatformReleaseStatus.RUNNING]: new Set([
    PlatformReleaseStatus.SUCCEEDED,
    PlatformReleaseStatus.ROLLED_BACK,
    PlatformReleaseStatus.FAILED,
  ]),
});
const RELEASE_REQUEST_TIMEOUT_MS = 6 * 60 * 60 * 1000;

function repositoryParts() {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(
    env.PLATFORM_RELEASE_GITHUB_REPOSITORY,
  );
  if (!match) {
    throw new Error('Platform release repository is invalid.');
  }
  return { owner: match[1], repo: match[2] };
}

async function githubToken() {
  if (!env.PLATFORM_RELEASE_GITHUB_TOKEN_PATH) {
    throw new Error('Platform release token is not configured.');
  }
  const token = (await readFile(env.PLATFORM_RELEASE_GITHUB_TOKEN_PATH, 'utf8')).trim();
  if (!token || token.length > 500) {
    throw new Error('Platform release token is invalid.');
  }
  return token;
}

async function githubRequest(
  path,
  { method = 'GET', body, fetchImpl = fetch, tokenLoader = githubToken } = {},
) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${await tokenLoader()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'HelloDeploy-platform-release',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub release API returned ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

export async function getLatestReleaseCandidate({
  fetchImpl = fetch,
  tokenLoader = githubToken,
} = {}) {
  if (!env.PLATFORM_RELEASE_AUTOMATION_ENABLED) {
    return { available: false, reason: 'Platform release automation is disabled.' };
  }
  const { owner, repo } = repositoryParts();
  const commit = await githubRequest(`/repos/${owner}/${repo}/commits/main`, {
    fetchImpl,
    tokenLoader,
  });
  const sha = commit?.sha?.toLowerCase();
  if (!SHA_PATTERN.test(sha ?? '')) {
    throw new Error('GitHub did not return a valid main commit.');
  }
  const result = await githubRequest(
    `/repos/${owner}/${repo}/commits/${sha}/check-runs?filter=all&per_page=100`,
    {
      fetchImpl,
      tokenLoader,
    },
  );
  const checks = REQUIRED_RELEASE_CHECKS.map((name) => {
    const matches = (result?.check_runs ?? []).filter(
      (check) => check.name === name && check.status === 'completed',
    );
    const check = matches.sort((a, b) => {
      const completedDifference =
        new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime();
      return completedDifference || Number(b.id ?? 0) - Number(a.id ?? 0);
    })[0];
    return {
      name,
      status: check?.status ?? 'missing',
      conclusion: check?.conclusion ?? null,
    };
  });
  const eligible = checks.every(
    (check) => check.status === 'completed' && check.conclusion === 'success',
  );
  return {
    available: true,
    sha,
    shortSha: sha.slice(0, 7),
    eligible,
    checks,
    sameAsRunning: sha === releaseSha,
  };
}

export async function getPlatformReleaseDashboard(deps = {}) {
  const { history, active } = await getPlatformReleaseRequests();
  let candidate;
  try {
    candidate = await getLatestReleaseCandidate(deps);
  } catch (error) {
    candidate = { available: false, reason: error.message };
  }
  return { candidate, active, history };
}

export async function getPlatformReleaseRequests() {
  await expireStalePlatformReleaseRequests();
  const [history, active] = await Promise.all([
    PlatformReleaseRequest.find().sort({ createdAt: -1 }).limit(10).lean(),
    PlatformReleaseRequest.findOne({ status: { $in: ACTIVE_STATUSES } }).lean(),
  ]);
  return { active, history };
}

async function expireStalePlatformReleaseRequests() {
  await PlatformReleaseRequest.updateMany(
    {
      status: { $in: ACTIVE_STATUSES },
      updatedAt: { $lt: new Date(Date.now() - RELEASE_REQUEST_TIMEOUT_MS) },
    },
    {
      $set: {
        status: PlatformReleaseStatus.FAILED,
        activeLock: null,
        failureCode: 'STATUS_TIMEOUT',
        completedAt: new Date(),
      },
    },
  );
}

export async function requestPlatformRelease({
  candidateSha,
  requestedBy,
  actorRole,
  sourceIp,
  correlationId,
  fetchImpl = fetch,
  tokenLoader = githubToken,
}) {
  if (actorRole !== PlatformRole.SUPER_ADMIN) {
    return { success: false, error: 'Only a Super Admin can deploy the platform.' };
  }
  const candidate = await getLatestReleaseCandidate({ fetchImpl, tokenLoader });
  const submittedSha = String(candidateSha ?? '').toLowerCase();
  if (!candidate.available || !candidate.eligible) {
    return { success: false, error: 'The latest main commit has not passed every required check.' };
  }
  if (!SHA_PATTERN.test(submittedSha) || submittedSha !== candidate.sha) {
    return { success: false, error: 'The release candidate changed. Refresh and review it again.' };
  }
  if (candidate.sameAsRunning) {
    return { success: false, error: 'The latest eligible release is already running.' };
  }

  await expireStalePlatformReleaseRequests();

  let request;
  try {
    request = await PlatformReleaseRequest.create({
      candidateSha: candidate.sha,
      previousSha: SHA_PATTERN.test(releaseSha ?? '') ? releaseSha : null,
      requestedBy,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return { success: false, error: 'Another platform release is already in progress.' };
    }
    throw error;
  }

  await writeAuditEvent({
    action: 'platform.release_requested',
    outcome: AuditOutcome.SUCCESS,
    actorId: requestedBy,
    actorRole,
    targetType: 'platform_release',
    targetId: request._id.toString(),
    sourceIp,
    correlationId,
    metadata: { candidateSha: candidate.sha, previousSha: request.previousSha },
  });

  const { owner, repo } = repositoryParts();
  try {
    request.status = PlatformReleaseStatus.DISPATCHED;
    await request.save();
    await githubRequest(
      `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(env.PLATFORM_RELEASE_WORKFLOW_FILE)}/dispatches`,
      {
        method: 'POST',
        body: {
          ref: 'main',
          inputs: { release_sha: candidate.sha, request_id: request._id.toString() },
        },
        fetchImpl,
        tokenLoader,
      },
    );
    await writeAuditEvent({
      action: 'platform.release_dispatched',
      outcome: AuditOutcome.SUCCESS,
      actorId: requestedBy,
      actorRole,
      targetType: 'platform_release',
      targetId: request._id.toString(),
      sourceIp,
      correlationId,
      metadata: { candidateSha: candidate.sha },
    });
    return { success: true, request };
  } catch {
    request.status = PlatformReleaseStatus.DISPATCH_FAILED;
    request.activeLock = null;
    request.failureCode = 'DISPATCH_FAILED';
    request.completedAt = new Date();
    await request.save();
    await writeAuditEvent({
      action: 'platform.release_dispatch_failed',
      outcome: AuditOutcome.FAILURE,
      actorId: requestedBy,
      actorRole,
      targetType: 'platform_release',
      targetId: request._id.toString(),
      sourceIp,
      correlationId,
      metadata: { candidateSha: candidate.sha },
    });
    return { success: false, error: 'GitHub did not accept the deployment request.' };
  }
}

function validSignature(rawBody, timestamp, signature) {
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) {
    return false;
  }
  const expected = `sha256=${createHmac('sha256', env.PLATFORM_RELEASE_CALLBACK_SECRET)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex')}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function applyPlatformReleaseCallback({ requestId, rawBody, timestamp, signature }) {
  if (!env.PLATFORM_RELEASE_AUTOMATION_ENABLED || !env.PLATFORM_RELEASE_CALLBACK_SECRET) {
    return { success: false, statusCode: 404, error: 'Release callbacks are disabled.' };
  }
  if (!Buffer.isBuffer(rawBody) || !validSignature(rawBody, timestamp, signature)) {
    return { success: false, statusCode: 401, error: 'Invalid callback signature.' };
  }
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { success: false, statusCode: 400, error: 'Invalid callback body.' };
  }
  const status = payload.status;
  const sequence = Number(payload.sequence);
  const runId = Number(payload.runId);
  const candidateSha = String(payload.releaseSha ?? '').toLowerCase();
  if (
    !SHA_PATTERN.test(candidateSha) ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !Object.values(PlatformReleaseStatus).includes(status)
  ) {
    return { success: false, statusCode: 400, error: 'Invalid callback fields.' };
  }
  if (!mongoose.isValidObjectId(requestId) || payload.requestId !== requestId) {
    return { success: false, statusCode: 400, error: 'Invalid release request identifier.' };
  }
  const request = await PlatformReleaseRequest.findById(requestId);
  if (!request || request.candidateSha !== candidateSha) {
    return { success: false, statusCode: 404, error: 'Release request not found.' };
  }
  if (sequence <= request.callbackSequence) {
    return { success: false, statusCode: 409, error: 'Callback was already applied.' };
  }
  if (!TRANSITIONS[request.status]?.has(status)) {
    return { success: false, statusCode: 409, error: 'Invalid release status transition.' };
  }
  const failureCode = payload.failureCode ? String(payload.failureCode) : null;
  if (
    (failureCode && !FAILURE_CODES.has(failureCode)) ||
    !FAILURE_CODES_BY_STATUS[status]?.has(failureCode)
  ) {
    return { success: false, statusCode: 400, error: 'Invalid failure code.' };
  }

  const { owner, repo } = repositoryParts();
  const changes = {
    status,
    callbackSequence: sequence,
    workflowRunId: runId,
    workflowRunUrl: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
    failureCode,
  };
  if (status === PlatformReleaseStatus.RUNNING) {
    changes.startedAt = new Date();
  }
  if (FINAL_STATUSES.has(status)) {
    changes.activeLock = null;
    changes.completedAt = new Date();
  }
  const updatedRequest = await PlatformReleaseRequest.findOneAndUpdate(
    {
      _id: request._id,
      candidateSha,
      status: request.status,
      callbackSequence: { $lt: sequence },
    },
    { $set: changes },
    { new: true, runValidators: true },
  );
  if (!updatedRequest) {
    return { success: false, statusCode: 409, error: 'Release status changed concurrently.' };
  }

  await writeAuditEvent({
    action: `platform.release_${status.toLowerCase()}`,
    outcome:
      status === PlatformReleaseStatus.SUCCEEDED
        ? AuditOutcome.SUCCESS
        : status === PlatformReleaseStatus.RUNNING
          ? AuditOutcome.SUCCESS
          : AuditOutcome.FAILURE,
    targetType: 'platform_release',
    targetId: updatedRequest._id.toString(),
    metadata: { candidateSha, failureCode, workflowRunId: runId },
  });
  return { success: true, request: updatedRequest };
}

export function serializeReleaseRequest(request) {
  return {
    id: request._id.toString(),
    candidateSha: request.candidateSha,
    previousSha: request.previousSha,
    status: request.status,
    workflowRunUrl: request.workflowRunUrl,
    failureCode: request.failureCode,
    createdAt: request.createdAt,
    startedAt: request.startedAt,
    completedAt: request.completedAt,
  };
}
