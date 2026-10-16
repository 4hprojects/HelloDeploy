import { spawn } from 'node:child_process';

import { env } from '../config/env.js';

const PINNED_GHCR_REFERENCE =
  /^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_./-]+(?::[a-z0-9_.-]+)?@sha256:[a-f0-9]{64}$/;
const GHCR_REPOSITORY = /^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_./-]+$/;

function runOras(args) {
  return new Promise((resolve) => {
    const stderr = [];
    const proc = spawn('oras', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr.on('data', (chunk) => stderr.push(chunk));
    proc.on('close', (code) => resolve({ code, stderr: Buffer.concat(stderr).toString('utf8') }));
    proc.on('error', (error) => resolve({ code: -1, stderr: error.message }));
  });
}

/**
 * Probe the registry using ORAS and the worker account's Docker credential
 * store. Tokens never enter argv, environment variables, jobs, or logs.
 */
export async function verifyRegistryAccess(repository, deps = { run: runOras }) {
  if (!GHCR_REPOSITORY.test(repository ?? '')) {
    throw new Error('Registry readiness requires a lowercase GHCR repository.');
  }
  const result = await deps.run(['repo', 'tags', '--last', '1', repository]);
  if (result.code !== 0) {
    throw new Error(`Registry is unavailable: ${result.stderr.trim().slice(0, 500)}`);
  }
  return { ready: true };
}

/**
 * Delete exactly one immutable GHCR manifest through the OCI API via ORAS.
 * Only manifests in the platform's own repository qualify: owner-supplied
 * images can also live on GHCR, and the platform credential must never
 * delete them.
 */
export async function deleteRegistryManifest(imageRef, deps = {}) {
  const run = deps.run ?? runOras;
  const platformRepository = deps.platformRepository ?? env.USER_IMAGE_REGISTRY;
  if (!PINNED_GHCR_REFERENCE.test(imageRef ?? '')) {
    throw new Error('Registry cleanup requires a digest-pinned GHCR image reference.');
  }
  const repository = imageRef.split('@')[0].replace(/:[a-z0-9_.-]+$/, '');
  if (!platformRepository || repository !== platformRepository) {
    throw new Error('Registry cleanup only deletes manifests in the platform registry.');
  }
  const result = await run(['manifest', 'delete', '--force', imageRef]);
  if (result.code !== 0) {
    throw new Error(`Registry manifest deletion failed: ${result.stderr.trim().slice(0, 500)}`);
  }
  return true;
}
