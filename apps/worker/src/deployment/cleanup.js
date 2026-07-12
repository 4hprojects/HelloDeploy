import { lstat, readdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { logger } from '@hellodeploy/observability';

/**
 * Remove the build workspace directory for a deployment.
 * Always resolves — cleanup is best-effort and must not crash the worker.
 *
 * @param {string} workDir - Absolute path to the build workspace
 */
export async function cleanupBuildWorkspace(workDir) {
  if (!workDir || !existsSync(workDir)) {
    return;
  }

  try {
    await rm(workDir, { recursive: true, force: true });
    logger.info('Cleanup: build workspace removed', { workDir });
  } catch (err) {
    logger.warn('Cleanup: failed to remove build workspace', {
      workDir,
      error: err.message,
    });
  }
}

/**
 * Remove direct child workspaces older than the cutoff. Entries are never
 * traversed before deletion, so a malicious symlink cannot escape the root.
 */
export async function cleanupAbandonedBuildWorkspaces(rootDir, olderThanMs, now = Date.now()) {
  const root = resolve(rootDir);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return 0;
    }
    throw err;
  }

  let removed = 0;
  for (const entry of entries) {
    const target = resolve(root, entry.name);
    if (!target.startsWith(`${root}${sep}`)) {
      continue;
    }
    const stats = await lstat(target);
    if (now - stats.mtimeMs < olderThanMs) {
      continue;
    }
    await rm(target, { recursive: true, force: true });
    removed++;
  }
  return removed;
}
