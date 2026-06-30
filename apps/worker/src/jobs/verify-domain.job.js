import { resolve as dnsResolve } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { Domain, Project, Deployment } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { generateServerBlock } from '../nginx/template.js';
import { activateRoute, removeRoute } from '../nginx/route-manager.js';
import { env } from '../config/env.js';

const VERIFICATION_TXT_PREFIX = 'hellodeploy-verify=';
const VERIFICATION_SUBDOMAIN_PREFIX = '_hellodeploy-verify.';

/**
 * Lookup DNS TXT records at `_hellodeploy-verify.{hostname}` and check for
 * the platform verification token.
 *
 * @param {string} hostname
 * @param {string} tokenHash - SHA-256 hash of the expected token
 * @returns {Promise<boolean>}
 */
async function verifyDnsTxtRecord(hostname, tokenHash) {
  const lookupName = `${VERIFICATION_SUBDOMAIN_PREFIX}${hostname}`;

  try {
    const records = await dnsResolve(lookupName, 'TXT');
    // Each record is an array of strings that should be concatenated
    for (const parts of records) {
      const fullRecord = parts.join('');
      if (fullRecord.startsWith(VERIFICATION_TXT_PREFIX)) {
        const token = fullRecord.slice(VERIFICATION_TXT_PREFIX.length);
        const hash = createHash('sha256').update(token).digest('hex');
        if (hash === tokenHash) {
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    logger.info('VerifyDomain: DNS lookup failed', { hostname: lookupName, error: err.message });
    return false;
  }
}

/**
 * VERIFY_DOMAIN job handler.
 *
 * Three modes:
 *   1. Default: verify TXT DNS record → mark VERIFIED or stay PENDING_VERIFICATION
 *   2. activateRoute: true → write nginx config for a just-approved domain
 *   3. removeRoute: true → remove nginx config for a removed domain
 */
export async function handleVerifyDomain(job) {
  const {
    domainId,
    projectId,
    hostname,
    activateRoute: shouldActivate,
    removeRoute: shouldRemove,
  } = job.data;

  const domain = await Domain.findById(domainId).lean();
  if (!domain) {
    logger.warn('VerifyDomain: domain not found', { domainId });
    return;
  }

  // ── Mode: activate nginx route (called after admin approval) ──────────────
  if (shouldActivate) {
    await activateNginxRoute(domain, projectId, hostname);
    return;
  }

  // ── Mode: remove nginx route (called on domain removal) ───────────────────
  if (shouldRemove) {
    await removeNginxRoute(hostname);
    return;
  }

  // ── Mode: verify DNS TXT record ───────────────────────────────────────────
  if (domain.status !== DomainStatus.PENDING_VERIFICATION) {
    logger.info('VerifyDomain: domain not in PENDING_VERIFICATION state', {
      domainId,
      status: domain.status,
    });
    return;
  }

  if (!domain.verificationTokenHash) {
    logger.warn('VerifyDomain: no verification token on record', { domainId });
    return;
  }

  const verified = await verifyDnsTxtRecord(hostname, domain.verificationTokenHash);

  if (verified) {
    await Domain.updateOne(
      { _id: domainId },
      {
        $set: {
          status: DomainStatus.PENDING_ADMIN_APPROVAL,
          verifiedAt: new Date(),
        },
      },
    );
    logger.info('VerifyDomain: DNS verified, pending admin approval', { domainId, hostname });
  } else {
    logger.info('VerifyDomain: DNS verification failed', { domainId, hostname });
    // Stay in PENDING_VERIFICATION — user can retry
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function activateNginxRoute(domain, projectId, hostname) {
  if (!env.NGINX_ENABLED) {
    return;
  }

  const project = await Project.findById(projectId).lean();
  if (!project?.activeDeploymentId) {
    logger.warn('VerifyDomain: no active deployment for nginx route', { projectId });
    return;
  }

  const deployment = await Deployment.findById(project.activeDeploymentId).lean();
  if (!deployment?.containerPort) {
    logger.warn('VerifyDomain: active deployment has no container port', {
      deploymentId: project.activeDeploymentId,
    });
    return;
  }

  const configContent = generateServerBlock({
    subdomain: hostname, // use full hostname as "subdomain" key (route-manager accepts FQDNs)
    domain: '', // empty domain: server_name will be just `hostname`
    port: deployment.containerPort,
    deploymentId: deployment._id.toString(),
  });

  // Override: for custom domains, server_name = full hostname (not subdomain.domain)
  const customConfig = configContent.replace(/server_name .+;/, `server_name ${hostname};`);

  // Slug for the nginx config filename: hash the hostname to a safe filename
  const slug = hostname.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '');

  try {
    await activateRoute({
      configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
      slug,
      configContent: customConfig,
      nginxBinary: env.NGINX_BINARY_PATH,
    });
    logger.info('VerifyDomain: nginx route activated for custom domain', { hostname });
  } catch (err) {
    logger.error('VerifyDomain: failed to activate nginx route', { hostname, error: err.message });
  }
}

async function removeNginxRoute(hostname) {
  if (!env.NGINX_ENABLED) {
    return;
  }

  const slug = hostname.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '');

  try {
    await removeRoute({
      configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
      slug,
      nginxBinary: env.NGINX_BINARY_PATH,
    });
    logger.info('VerifyDomain: nginx route removed for custom domain', { hostname });
  } catch (err) {
    logger.warn('VerifyDomain: failed to remove nginx route', { hostname, error: err.message });
  }
}
