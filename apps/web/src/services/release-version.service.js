import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

let cached = null;

/**
 * Identify the release this process is running.
 *
 * Resolution order: the ref the installer recorded, then the checkout's own
 * HEAD. Resolved once — the answer cannot change without restarting the
 * process, which is the point: it reports what is *running*, not what is on
 * disk now.
 *
 * @returns {Promise<{ commit: string|null, source: string }>}
 */
export async function getReleaseVersion() {
  if (cached) {
    return cached;
  }

  if (process.env.HELLODEPLOY_RELEASE_REF) {
    cached = { commit: process.env.HELLODEPLOY_RELEASE_REF, source: 'environment' };
    return cached;
  }

  try {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { timeout: 2000 });
    cached = { commit: stdout.trim(), source: 'checkout' };
  } catch {
    // A deployment installed without its git metadata is valid, just opaque.
    cached = { commit: null, source: 'unknown' };
  }

  return cached;
}

/** Test seam — the resolved value is otherwise process-lifetime. */
export function resetReleaseVersionCache() {
  cached = null;
}
