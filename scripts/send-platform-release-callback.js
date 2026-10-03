#!/usr/bin/env node
import { createHmac } from 'node:crypto';

function argument(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? '') : fallback;
}

const requestId = process.env.RELEASE_REQUEST_ID ?? '';
const releaseSha = process.env.RELEASE_SHA ?? '';
const callbackBaseUrl = process.env.RELEASE_CALLBACK_BASE_URL ?? '';
const secret = process.env.RELEASE_CALLBACK_SECRET ?? '';
const status = argument('status');
const sequence = Number(argument('sequence'));
const runId = Number(process.env.GITHUB_RUN_ID);
const failureCode = argument('failure-code') || null;

if (
  !/^[a-f0-9]{24}$/.test(requestId) ||
  !/^[a-f0-9]{40}$/.test(releaseSha) ||
  !/^https:\/\/[^/]+(?:\/.*)?$/.test(callbackBaseUrl) ||
  !secret ||
  !['RUNNING', 'SUCCEEDED', 'ROLLED_BACK', 'FAILED'].includes(status) ||
  !Number.isInteger(sequence) ||
  sequence < 1 ||
  !Number.isSafeInteger(runId) ||
  runId < 1
) {
  process.stderr.write('Invalid platform release callback configuration.\n');
  process.exit(64);
}

const body = JSON.stringify({ requestId, releaseSha, status, sequence, runId, failureCode });
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
const url = new URL(
  `api/internal/platform-releases/${requestId}/status`,
  callbackBaseUrl.endsWith('/') ? callbackBaseUrl : `${callbackBaseUrl}/`,
);
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-HelloDeploy-Timestamp': timestamp,
    'X-HelloDeploy-Signature': `sha256=${signature}`,
  },
  body,
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) {
  process.stderr.write(`Platform release callback returned ${response.status}.\n`);
  process.exit(1);
}
