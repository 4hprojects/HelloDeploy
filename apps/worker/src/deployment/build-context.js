import { readdir, stat, unlink, realpath } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { logger } from '@hellodeploy/observability';

const MAX_CONTEXT_BYTES = 500 * 1024 * 1024; // 500 MB

// Patterns that must be removed from the build context (we generate our own)
const FORBIDDEN_FILENAMES = [
  'Dockerfile',
  'dockerfile',
  '.dockerignore',
  'docker-compose.yml',
  'docker-compose.yaml',
  'docker-compose.override.yml',
];

// ─── Path traversal guard ──────────────────────────────────────────────────────

/**
 * Verify that `targetPath` resolves to a location inside `rootDir`.
 * Throws if any path traversal attempt is detected.
 */
function assertInsideRoot(rootDir, targetPath) {
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(join(rootDir, targetPath));
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith('..') || rel.startsWith(sep + '..')) {
    throw new Error(`Path traversal detected: ${targetPath}`);
  }
}

// ─── Directory size ────────────────────────────────────────────────────────────

async function getDirectorySize(dir, depth = 0) {
  if (depth > 20) {
    return 0;
  }
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(p, depth + 1);
    } else if (entry.isFile()) {
      const s = await stat(p);
      total += s.size;
    }
  }
  return total;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate and sanitize a cloned build context directory.
 *
 * - Checks for path traversal in all top-level filenames
 * - Removes user-provided Dockerfiles and docker-compose files
 * - Enforces a maximum context size
 *
 * @param {string} contextDir - Absolute path to the cloned source directory
 * @returns {Promise<{ sizeBytes: number }>}
 */
export async function prepareBuildContext(contextDir) {
  const resolvedRoot = resolve(contextDir);

  // ── Validate all top-level filenames and remove unsafe entries ───────────
  const topEntries = await readdir(resolvedRoot, { withFileTypes: true });
  for (const entry of topEntries) {
    assertInsideRoot(resolvedRoot, entry.name);

    // path.resolve() does not follow symlinks — verify the real target is inside
    // the root so a symlink pointing to /etc (or similar) cannot expose host files
    // to the Docker build context.
    if (entry.isSymbolicLink()) {
      const entryPath = join(resolvedRoot, entry.name);
      try {
        const realTarget = await realpath(entryPath);
        const rel = relative(resolvedRoot, realTarget);
        if (rel.startsWith('..')) {
          await unlink(entryPath);
          logger.warn('BuildContext: removed symlink escaping context root', { name: entry.name });
        }
      } catch {
        // Broken (dangling) symlink — remove it
        await unlink(entryPath);
        logger.warn('BuildContext: removed broken symlink', { name: entry.name });
      }
    }
  }

  // ── Remove forbidden files ─────────────────────────────────────────────────
  for (const name of FORBIDDEN_FILENAMES) {
    const filePath = join(resolvedRoot, name);
    try {
      await unlink(filePath);
      logger.info('BuildContext: removed forbidden file', { name });
    } catch {
      // File doesn't exist — that's fine
    }
  }

  // ── Size check ─────────────────────────────────────────────────────────────
  const sizeBytes = await getDirectorySize(resolvedRoot);
  if (sizeBytes > MAX_CONTEXT_BYTES) {
    throw new Error(
      `Build context is too large: ${Math.round(sizeBytes / 1024 / 1024)} MB (max 500 MB)`,
    );
  }

  logger.info('BuildContext: prepared', {
    sizeBytes,
    sizeMb: Math.round(sizeBytes / 1024 / 1024),
  });

  return { sizeBytes };
}
