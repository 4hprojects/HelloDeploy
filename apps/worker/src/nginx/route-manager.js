import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { AuditOutcome } from '@hellodeploy/contracts';
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
 * Activate one Nginx route through the atomic batch implementation.
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
export async function activateRoute({
  configDir,
  slug,
  configContent,
  nginxBinary = 'nginx',
  commandRunner = runCommand,
}) {
  return activateRoutes({
    configDir,
    routes: [{ slug, configContent }],
    nginxBinary,
    commandRunner,
  });
}

function validateRouteBatch(routes, { requireConfig }) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('Nginx route batch must contain at least one route.');
  }

  const slugs = new Set();
  for (const route of routes) {
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      throw new Error('Each Nginx route must be an object.');
    }
    assertSafeSlug(route.slug);
    if (slugs.has(route.slug)) {
      throw new Error(`Duplicate Nginx route slug: "${route.slug}"`);
    }
    if (requireConfig && typeof route.configContent !== 'string') {
      throw new Error(`Nginx route "${route.slug}" requires string configContent.`);
    }
    slugs.add(route.slug);
  }
}

async function restoreRouteBatch(entries, { nginxBinary, commandRunner, activationError }) {
  const restoreFailures = [];

  for (const entry of entries) {
    try {
      if (entry.hadExisting) {
        await fs.copyFile(entry.bakPath, entry.confPath);
      } else {
        await fs.unlink(entry.confPath).catch((err) => {
          if (err.code !== 'ENOENT') {
            throw err;
          }
        });
      }
      await fs.unlink(entry.tmpPath).catch(() => {});
    } catch (err) {
      restoreFailures.push({ slug: entry.slug, error: err.message });
    }
  }

  if (restoreFailures.length === 0) {
    try {
      await commandRunner(nginxBinary, ['-t']);
      await commandRunner(nginxBinary, ['-s', 'reload']);
    } catch (err) {
      restoreFailures.push({ slug: 'nginx-reload', error: err.message });
    }
  }

  if (restoreFailures.length > 0) {
    logger.error('NginxRoute: CRITICAL — batch route restoration failed', {
      activationError: activationError.message,
      failures: restoreFailures,
    });
    writeAuditEvent({
      action: 'nginx.route_restore_failed',
      outcome: AuditOutcome.FAILURE,
      targetType: 'nginx_route_batch',
      targetId: entries.map((entry) => entry.slug).join(','),
      metadata: { activationError: activationError.message, restoreFailures },
    }).catch(() => {});
  }
  return restoreFailures.length === 0;
}

/** Atomically activate a complete set of Nginx route files with one validation and reload. */
export async function activateRoutes({
  configDir,
  routes,
  nginxBinary = 'nginx',
  commandRunner = runCommand,
}) {
  validateRouteBatch(routes, { requireConfig: true });
  const transactionId = randomUUID();
  const entries = [];
  try {
    for (const { slug, configContent } of routes) {
      const confPath = join(configDir, `${slug}.conf`);
      const entry = {
        slug,
        configContent,
        confPath,
        tmpPath: join(configDir, `${slug}.conf.${transactionId}.tmp`),
        bakPath: join(configDir, `${slug}.conf.${transactionId}.bak`),
        hadExisting: await fileExists(confPath),
      };
      entries.push(entry);
      if (entry.hadExisting) {
        await fs.copyFile(confPath, entry.bakPath);
      }
    }
  } catch (err) {
    await Promise.all(entries.map((entry) => fs.unlink(entry.bakPath).catch(() => {})));
    throw err;
  }

  let cleanupBackups = false;
  try {
    for (const entry of entries) {
      await fs.writeFile(entry.tmpPath, entry.configContent, { encoding: 'utf8', mode: 0o640 });
    }
    for (const entry of entries) {
      await fs.rename(entry.tmpPath, entry.confPath);
    }
    await commandRunner(nginxBinary, ['-t']);
    await commandRunner(nginxBinary, ['-s', 'reload']);
    logger.info('NginxRoute: activated route batch', { slugs: entries.map((entry) => entry.slug) });
    cleanupBackups = true;
  } catch (err) {
    logger.error('NginxRoute: batch activation failed, restoring all routes', {
      slugs: entries.map((entry) => entry.slug),
      error: err.message,
    });
    cleanupBackups = await restoreRouteBatch(entries, {
      nginxBinary,
      commandRunner,
      activationError: err,
    });
    throw err;
  } finally {
    await Promise.all(entries.map((entry) => fs.unlink(entry.tmpPath).catch(() => {})));
    if (cleanupBackups) {
      await Promise.all(entries.map((entry) => fs.unlink(entry.bakPath).catch(() => {})));
    }
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
export async function removeRoute({
  configDir,
  slug,
  nginxBinary = 'nginx',
  commandRunner = runCommand,
}) {
  return removeRoutes({ configDir, routes: [{ slug }], nginxBinary, commandRunner });
}

/** Atomically remove a complete set of Nginx route files with one validation and reload. */
export async function removeRoutes({
  configDir,
  routes,
  nginxBinary = 'nginx',
  commandRunner = runCommand,
}) {
  validateRouteBatch(routes, { requireConfig: false });
  const transactionId = randomUUID();
  const entries = [];
  try {
    for (const { slug } of routes) {
      const confPath = join(configDir, `${slug}.conf`);
      if (!(await fileExists(confPath))) {
        continue;
      }
      const entry = {
        slug,
        confPath,
        tmpPath: join(configDir, `${slug}.conf.${transactionId}.tmp`),
        bakPath: join(configDir, `${slug}.conf.${transactionId}.bak`),
        hadExisting: true,
      };
      entries.push(entry);
      await fs.copyFile(confPath, entry.bakPath);
    }
  } catch (err) {
    await Promise.all(entries.map((entry) => fs.unlink(entry.bakPath).catch(() => {})));
    throw err;
  }
  if (entries.length === 0) {
    return;
  }

  let cleanupBackups = false;
  try {
    for (const entry of entries) {
      await fs.unlink(entry.confPath);
    }
    await commandRunner(nginxBinary, ['-t']);
    await commandRunner(nginxBinary, ['-s', 'reload']);
    logger.info('NginxRoute: removed route batch', { slugs: entries.map((entry) => entry.slug) });
    cleanupBackups = true;
  } catch (err) {
    cleanupBackups = await restoreRouteBatch(entries, {
      nginxBinary,
      commandRunner,
      activationError: err,
    });
    throw err;
  } finally {
    if (cleanupBackups) {
      await Promise.all(entries.map((entry) => fs.unlink(entry.bakPath).catch(() => {})));
    }
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
export async function validateNginxConfig(nginxBinary = 'nginx', commandRunner = runCommand) {
  await commandRunner(nginxBinary, ['-t']);
}
