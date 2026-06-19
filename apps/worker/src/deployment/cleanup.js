import { rm } from 'node:fs/promises';
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
