import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Read the commit a checkout is on, without invoking git.
 *
 * `infrastructure/upgrade.sh` installs a release with `git checkout --detach`,
 * so production's `.git/HEAD` holds the deployed SHA directly. Git is not run
 * here on purpose: the production checkout is `root:hellodeploy-config` mode
 * 750, where git refuses to operate as the web user ("dubious ownership"), while
 * reading one small file may still succeed.
 *
 * Returns null for anything unexpected rather than throwing. A tarball install,
 * a permission-walled `.git`, or a branch whose ref is packed rather than loose
 * must not stop the liveness endpoint answering — which is the one thing it
 * exists to do.
 *
 * @param {string} [rootDir] Checkout root to inspect.
 * @returns {string|null} The 40-character commit SHA, or null.
 */
export function readReleaseSha(rootDir = REPO_ROOT) {
  try {
    const head = readFileSync(join(rootDir, '.git', 'HEAD'), 'utf8').trim();

    // Detached, as a deployed release always is.
    if (FULL_SHA_PATTERN.test(head)) {
      return head;
    }

    // On a branch, as a development checkout usually is.
    const ref = head.startsWith('ref: ') ? head.slice(5).trim() : null;
    if (!ref) {
      return null;
    }
    const resolved = readFileSync(join(rootDir, '.git', ref), 'utf8').trim();
    return FULL_SHA_PATTERN.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * The commit this process is running, resolved once at startup.
 *
 * Read at import rather than per request: `/health` is polled every ten minutes
 * by the uptime workflow, and the answer cannot change without a restart.
 */
export const releaseSha = readReleaseSha();
