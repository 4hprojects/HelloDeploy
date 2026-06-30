import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { logger } from '@hellodeploy/observability';
import { isValidSubdomainLabel } from './reserved-subdomains.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function runCommand(binary, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => err.push(d));
    proc.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8').trim();
      const stderr = Buffer.concat(err).toString('utf8').trim();
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${binary} ${args[0]} failed (exit ${code}): ${stderr.slice(0, 500)}`));
      }
    });
    proc.on('error', (e) => reject(new Error(`Failed to spawn ${binary}: ${e.message}`)));
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Guard against path traversal in slug-derived filenames.
 * Slug must be a valid subdomain label — no slashes, dots, or other metacharacters.
 *
 * @param {string} slug
 * @throws {Error} if slug is not safe to use as a filename component
 */
function assertSafeSlug(slug) {
  if (!isValidSubdomainLabel(slug)) {
    throw new Error(`Unsafe slug for nginx config filename: "${slug}"`);
  }
  // Extra safety: ensure no path separator characters snuck through
  if (slug !== basename(slug)) {
    throw new Error(`Slug contains path separator characters: "${slug}"`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Atomically write a new Nginx route for a project subdomain.
 *
 * Steps:
 *   1. Validate slug (path traversal guard)
 *   2. Backup existing config (if any) to {slug}.conf.bak
 *   3. Write new config to {slug}.conf.tmp
 *   4. Rename .tmp → .conf  (atomic on same filesystem)
 *   5. Run nginx -t to validate entire config
 *   6. On failure: restore backup and re-throw
 *   7. Run nginx -s reload
 *   8. On success: remove backup
 *
 * SECURITY: slug is validated before use as a filename component.
 * All nginx invocations use command arrays — no shell interpolation.
 *
 * @param {{
 *   configDir: string,    - directory for hellodeploy nginx configs
 *   slug: string,         - project slug (used as filename basis)
 *   configContent: string, - full nginx server block to write
 *   nginxBinary?: string, - path to nginx binary (default 'nginx')
 * }} opts
 * @returns {Promise<void>}
 * @throws {Error} if nginx -t validation fails or reload fails
 */
export async function activateRoute({ configDir, slug, configContent, nginxBinary = 'nginx' }) {
  assertSafeSlug(slug);

  const confPath = join(configDir, `${slug}.conf`);
  const tmpPath = join(configDir, `${slug}.conf.tmp`);
  const bakPath = join(configDir, `${slug}.conf.bak`);

  const hadExisting = await fileExists(confPath);

  if (hadExisting) {
    await fs.copyFile(confPath, bakPath);
    logger.info('NginxRoute: backed up existing config', { slug, bakPath });
  }

  try {
    // Write to temp first, then rename atomically
    await fs.writeFile(tmpPath, configContent, { encoding: 'utf8', mode: 0o640 });
    await fs.rename(tmpPath, confPath);
    logger.info('NginxRoute: wrote new config', { slug, confPath });

    // Validate the full nginx config (includes our new file)
    await runCommand(nginxBinary, ['-t']);
    logger.info('NginxRoute: nginx -t passed', { slug });

    // Reload nginx to activate the new route
    await runCommand(nginxBinary, ['-s', 'reload']);
    logger.info('NginxRoute: nginx reloaded', { slug });

    // Clean up backup on success
    if (hadExisting) {
      await fs.unlink(bakPath).catch(() => {});
    }
  } catch (err) {
    logger.error('NginxRoute: activation failed, restoring backup', { slug, error: err.message });

    // Restore previous state
    if (hadExisting) {
      await fs.rename(bakPath, confPath).catch((restoreErr) => {
        logger.error('NginxRoute: CRITICAL — failed to restore backup', {
          slug,
          error: restoreErr.message,
        });
      });
    } else {
      await fs.unlink(confPath).catch(() => {});
    }

    // Clean up temp if it still exists
    await fs.unlink(tmpPath).catch(() => {});

    throw err;
  }
}

/**
 * Remove a project's Nginx route file and reload.
 * Non-fatal if the file doesn't exist.
 *
 * @param {{
 *   configDir: string,
 *   slug: string,
 *   nginxBinary?: string,
 * }} opts
 */
export async function removeRoute({ configDir, slug, nginxBinary = 'nginx' }) {
  assertSafeSlug(slug);

  const confPath = join(configDir, `${slug}.conf`);

  const exists = await fileExists(confPath);
  if (!exists) {
    logger.info('NginxRoute: no config to remove', { slug });
    return;
  }

  const bakPath = join(configDir, `${slug}.conf.bak`);
  await fs.copyFile(confPath, bakPath).catch(() => {});
  await fs.unlink(confPath);

  try {
    await runCommand(nginxBinary, ['-t']);
    await runCommand(nginxBinary, ['-s', 'reload']);
    logger.info('NginxRoute: removed route and reloaded', { slug });
    await fs.unlink(bakPath).catch(() => {});
  } catch (err) {
    // Restore on failure (unlikely but safe)
    logger.error('NginxRoute: reload after removal failed, restoring', {
      slug,
      error: err.message,
    });
    await fs.rename(bakPath, confPath).catch(() => {});
    throw err;
  }
}

/**
 * Read the current config content for a slug, if it exists.
 *
 * @param {{ configDir: string, slug: string }} opts
 * @returns {Promise<string | null>}
 */
export async function readRouteConfig({ configDir, slug }) {
  assertSafeSlug(slug);
  const confPath = join(configDir, `${slug}.conf`);
  try {
    return await fs.readFile(confPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Run nginx -t without making any changes.
 * Useful for pre-flight validation checks.
 *
 * @param {string} nginxBinary
 * @returns {Promise<void>}
 */
export async function validateNginxConfig(nginxBinary = 'nginx') {
  await runCommand(nginxBinary, ['-t']);
}
