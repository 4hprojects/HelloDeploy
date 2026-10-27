import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { Domain, Project } from '@hellodeploy/database';
import { DomainStatus, DomainType, DomainRoutingState, AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent, logger } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { env } from '../config/env.js';
import { getDeploymentQueue } from '../queue/client.js';
import {
  CUSTOM_HOSTNAME_LIMIT,
  defaultCustomHostnameClient,
  logCustomHostnameFailure,
  toCustomHostnameFields,
} from './cloudflare-custom-hostnames.js';
import { escapedSearchRegex, normalizeAdminSearch } from './admin.service.js';
import { checkDomainQuota } from './quota.service.js';
import { JobType } from '@hellodeploy/contracts';

// ─── Hostname normalization ────────────────────────────────────────────────────

const PLATFORM_DOMAINS = new Set(['hellodeploy.online', 'hellodeploy.com', 'localhost']);
const DOMAIN_QUEUE_UNAVAILABLE_COPY =
  'Domain verification queue is unavailable. Ask an administrator to check Redis and worker health, then try again.';
const DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY =
  'Could not queue the domain routing change. Ask an administrator to check Redis and worker health, then try again.';
const DOMAIN_OPERATION_IN_PROGRESS_COPY =
  'A domain operation is already in progress. Wait for it to finish, then try again.';

function createDomainOperationId() {
  return randomUUID();
}

function domainJobId(action, domainId, operationId) {
  return `${action}-domain-${domainId}-${operationId}`;
}

async function ensureLifecycleVersion(domain) {
  const lifecycleVersion = domain.lifecycleVersion ?? 1;
  if (domain.lifecycleVersion === undefined || domain.lifecycleVersion === null) {
    await Domain.updateOne(
      { _id: domain._id, lifecycleVersion: null },
      { $set: { lifecycleVersion } },
    );
  }
  return lifecycleVersion;
}

function domainVerificationStateCopy(status) {
  if (status === DomainStatus.PENDING_ADMIN_APPROVAL) {
    return 'DNS is already verified and this domain is awaiting admin approval.';
  }
  if ([DomainStatus.VERIFYING, DomainStatus.ACTIVATING, DomainStatus.REMOVING].includes(status)) {
    return DOMAIN_OPERATION_IN_PROGRESS_COPY;
  }
  if (status === DomainStatus.VERIFIED) {
    return 'DNS is already verified. Routing can now be activated.';
  }
  if (status === DomainStatus.ACTIVE) {
    return 'This domain is already active.';
  }
  return `Domain cannot be verified in status ${status}.`;
}

/**
 * Normalize and validate a user-submitted hostname.
 * Returns the lowercase normalized form, or throws on invalid/reserved input.
 *
 * @param {string} raw
 * @returns {string} normalized hostname
 */
export function normalizeHostname(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Hostname is required.');
  }

  const trimmed = raw.trim().toLowerCase();

  // Use the URL constructor for authoritative parsing
  let parsed;
  try {
    parsed = new URL(`http://${trimmed}`);
  } catch {
    throw new Error('Invalid hostname format.');
  }

  const hostname = parsed.hostname;

  if (!hostname) {
    throw new Error('Hostname could not be parsed.');
  }

  // Length limits (RFC 1035)
  if (hostname.length > 253) {
    throw new Error('Hostname exceeds maximum length (253 chars).');
  }

  // Block localhost and local addresses
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Hostname "localhost" is not allowed.');
  }

  // Block platform domains and subdomains
  for (const pd of PLATFORM_DOMAINS) {
    if (hostname === pd || hostname.endsWith(`.${pd}`)) {
      throw new Error(`Hostname may not be a subdomain of the platform domain.`);
    }
  }

  // Block raw IP addresses
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')) {
    throw new Error('IP addresses are not allowed as custom domains.');
  }

  // Must contain at least one dot (e.g. "example.com" not just "example")
  if (!hostname.includes('.')) {
    throw new Error('Hostname must be a fully qualified domain name (e.g. app.example.com).');
  }

  return hostname;
}

// ─── Add custom domain ─────────────────────────────────────────────────────────

/**
 * Register a new custom domain for a project.
 * Generates a DNS TXT verification token — never stored in plaintext.
 */
export async function addDomain(projectId, hostnameRaw, actorId, opts = {}) {
  let hostnameNormalized;
  try {
    hostnameNormalized = normalizeHostname(hostnameRaw);
  } catch (err) {
    return { success: false, error: err.message };
  }

  // Prevent duplicate claims across all projects (including own)
  const existing = await Domain.findOne({ hostnameNormalized }).lean();
  if (existing && existing.status !== DomainStatus.REMOVED) {
    return { success: false, error: 'This domain is already claimed.' };
  }
  // If REMOVED, allow re-adding (upsert below handles it)

  const project = await Project.findById(projectId).select('ownerId').lean();
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }
  const quotaRefusal = await checkDomainQuota(project);
  if (quotaRefusal) {
    return { success: false, ...quotaRefusal };
  }

  // Generate a random verification token
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  let domain;
  if (existing) {
    // Re-activate a previously removed domain
    const reclaimed = await Domain.updateOne(
      { _id: existing._id, status: DomainStatus.REMOVED },
      {
        $set: {
          projectId,
          status: DomainStatus.PENDING_VERIFICATION,
          verificationTokenHash: tokenHash,
          verifiedAt: null,
          activatedAt: null,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          addedBy: actorId,
          removedAt: null,
          lifecycleVersion: (existing.lifecycleVersion ?? 1) + 1,
          operationId: null,
          operationError: null,
          operationStartedAt: null,
          operationCompletedAt: null,
        },
      },
    );
    if (reclaimed.modifiedCount === 0) {
      return { success: false, error: 'This domain is already claimed.' };
    }
    domain = await Domain.findById(existing._id).lean();
  } else {
    domain = await Domain.create({
      projectId,
      hostnameNormalized,
      type: DomainType.CUSTOM,
      status: DomainStatus.PENDING_VERIFICATION,
      verificationTokenHash: tokenHash,
      addedBy: actorId,
    });
  }

  await writeAuditEvent({
    action: 'domain.added',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'domain',
    targetId: domain._id.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { hostnameNormalized, projectId: projectId.toString() },
  });

  // Return the plaintext token — this is the only time it is visible
  return { success: true, domain, verificationToken: token };
}

// ─── Request verification ──────────────────────────────────────────────────────

/**
 * Enqueue a VERIFY_DOMAIN job to check the TXT record.
 */
export async function requestVerification(domainId, projectId, actorId, opts = {}) {
  const operationId = createDomainOperationId();
  const startedAt = new Date();
  const domain = await Domain.findOneAndUpdate(
    { _id: domainId, projectId, status: DomainStatus.PENDING_VERIFICATION },
    {
      $set: {
        status: DomainStatus.VERIFYING,
        operationId,
        operationError: null,
        operationStartedAt: startedAt,
        operationCompletedAt: null,
      },
    },
    { new: true },
  ).lean();
  if (!domain) {
    const existing = await Domain.findOne({ _id: domainId, projectId }).lean();
    return {
      success: false,
      error: existing ? domainVerificationStateCopy(existing.status) : 'Domain not found.',
    };
  }
  const lifecycleVersion = await ensureLifecycleVersion(domain);

  const queue = opts.queue === undefined ? getDeploymentQueue() : opts.queue;
  if (!queue) {
    await Domain.updateOne(
      { _id: domainId, status: DomainStatus.VERIFYING, operationId },
      {
        $set: {
          status: DomainStatus.PENDING_VERIFICATION,
          operationError: DOMAIN_QUEUE_UNAVAILABLE_COPY,
          operationCompletedAt: new Date(),
        },
      },
    );
    return { success: false, error: DOMAIN_QUEUE_UNAVAILABLE_COPY };
  }

  try {
    await enqueueJob(
      queue,
      JobType.VERIFY_DOMAIN,
      {
        version: 2,
        correlationId: opts.correlationId,
        actorId,
        actorRole: 'USER',
        domainId: domainId.toString(),
        projectId: domain.projectId.toString(),
        hostname: domain.hostnameNormalized,
        lifecycleVersion,
        operationId,
      },
      { jobId: domainJobId('verify', domainId, operationId) },
    );
  } catch (err) {
    logger.warn('Domain: failed to enqueue verification', {
      domainId: domainId.toString(),
      error: err.message,
    });
    await Domain.updateOne(
      { _id: domainId, status: DomainStatus.VERIFYING, operationId },
      {
        $set: {
          status: DomainStatus.PENDING_VERIFICATION,
          operationError: DOMAIN_QUEUE_UNAVAILABLE_COPY,
          operationCompletedAt: new Date(),
        },
      },
    );
    return { success: false, error: DOMAIN_QUEUE_UNAVAILABLE_COPY };
  }

  await writeAuditEvent({
    action: 'domain.verification_started',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'domain',
    targetId: domainId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { hostname: domain.hostnameNormalized, projectId: domain.projectId.toString() },
  });

  return { success: true, operationId };
}

// ─── Admin approval ────────────────────────────────────────────────────────────

export async function approveDomain(domainId, adminId, opts = {}) {
  const domain = await Domain.findById(domainId);
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
  }

  if (domain.status !== DomainStatus.PENDING_ADMIN_APPROVAL) {
    return {
      success: false,
      error: `Domain is not awaiting admin approval (status: ${domain.status}).`,
    };
  }

  // Check the project has an active deployment to route to
  const project = await Project.findById(domain.projectId).lean();
  if (!project?.activeDeploymentId) {
    return {
      success: false,
      error:
        'Project has no active deployment. Deploy a healthy release before activating this domain.',
    };
  }

  const queue = opts.queue === undefined ? getDeploymentQueue() : opts.queue;
  if (!queue) {
    return { success: false, error: DOMAIN_QUEUE_UNAVAILABLE_COPY };
  }

  const operationId = createDomainOperationId();
  const claimed = await Domain.findOneAndUpdate(
    { _id: domainId, status: DomainStatus.PENDING_ADMIN_APPROVAL },
    {
      $set: {
        status: DomainStatus.ACTIVATING,
        approvedBy: adminId,
        approvedAt: new Date(),
        rejectionReason: null,
        operationId,
        operationError: null,
        operationStartedAt: new Date(),
        operationCompletedAt: null,
      },
    },
    { new: true },
  ).lean();
  if (!claimed) {
    return { success: false, error: 'Domain state changed before activation could be queued.' };
  }
  const lifecycleVersion = await ensureLifecycleVersion(claimed);

  try {
    await enqueueJob(
      queue,
      JobType.ACTIVATE_DOMAIN,
      {
        version: 2,
        correlationId: opts.correlationId,
        actorId: adminId,
        actorRole: 'SUPER_ADMIN',
        domainId: domainId.toString(),
        projectId: claimed.projectId.toString(),
        hostname: claimed.hostnameNormalized,
        lifecycleVersion,
        operationId,
        legacyApproval: true,
      },
      { jobId: domainJobId('activate', domainId, operationId) },
    );
  } catch (err) {
    logger.warn('Domain: failed to enqueue route activation, approval reverted', {
      domainId: domainId.toString(),
      error: err.message,
    });
    await Domain.updateOne(
      { _id: domainId, status: DomainStatus.ACTIVATING, operationId },
      {
        $set: {
          status: DomainStatus.PENDING_ADMIN_APPROVAL,
          approvedBy: null,
          approvedAt: null,
          operationError: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY,
          operationCompletedAt: new Date(),
        },
      },
    );
    return { success: false, error: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY };
  }

  await writeAuditEvent({
    action: 'domain.approved',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    targetType: 'domain',
    targetId: domainId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { hostname: domain.hostnameNormalized, projectId: domain.projectId.toString() },
  });

  return { success: true };
}

export async function requestDomainActivation(domainId, projectId, actorId, opts = {}) {
  const project = await Project.findOne({
    _id: projectId,
    activeDeploymentId: { $ne: null },
  }).lean();
  if (!project) {
    return { success: false, error: 'Deploy a healthy release before activating this domain.' };
  }

  const operationId = createDomainOperationId();
  const domain = await Domain.findOneAndUpdate(
    { _id: domainId, projectId, status: DomainStatus.VERIFIED },
    {
      $set: {
        status: DomainStatus.ACTIVATING,
        operationId,
        operationError: null,
        operationStartedAt: new Date(),
        operationCompletedAt: null,
      },
    },
    { new: true },
  ).lean();
  if (!domain) {
    return { success: false, error: 'Domain is not ready for activation.' };
  }
  const lifecycleVersion = await ensureLifecycleVersion(domain);

  const queue = opts.queue === undefined ? getDeploymentQueue() : opts.queue;
  if (!queue) {
    await Domain.updateOne(
      { _id: domainId, operationId },
      {
        $set: {
          status: DomainStatus.VERIFIED,
          operationError: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY,
          operationCompletedAt: new Date(),
        },
      },
    );
    return { success: false, error: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY };
  }

  try {
    await enqueueJob(
      queue,
      JobType.ACTIVATE_DOMAIN,
      {
        version: 2,
        correlationId: opts.correlationId,
        actorId,
        actorRole: 'USER',
        domainId: domainId.toString(),
        projectId: domain.projectId.toString(),
        hostname: domain.hostnameNormalized,
        lifecycleVersion,
        operationId,
      },
      { jobId: domainJobId('activate', domainId, operationId) },
    );
  } catch (err) {
    logger.warn('Domain: failed to enqueue route activation', {
      domainId: domainId.toString(),
      error: err.message,
    });
    await Domain.updateOne(
      { _id: domainId, operationId },
      {
        $set: {
          status: DomainStatus.VERIFIED,
          operationError: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY,
          operationCompletedAt: new Date(),
        },
      },
    );
    return { success: false, error: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY };
  }

  await writeAuditEvent({
    action: 'domain.activation_started',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'domain',
    targetId: domainId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { hostname: domain.hostnameNormalized, projectId: domain.projectId.toString() },
  });

  return { success: true, operationId };
}

export async function rejectDomain(domainId, adminId, reason, opts = {}) {
  const domain = await Domain.findById(domainId);
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
  }

  await Domain.updateOne(
    { _id: domainId },
    { $set: { status: DomainStatus.FAILED, rejectionReason: reason?.slice(0, 500) ?? null } },
  );

  await writeAuditEvent({
    action: 'domain.rejected',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    projectId: domain.projectId,
    targetType: 'domain',
    targetId: domainId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { hostname: domain.hostnameNormalized, reason },
  });

  return { success: true };
}

// ─── Remove domain ─────────────────────────────────────────────────────────────

export async function removeDomain(domainId, projectId, actorId, opts = {}) {
  const domain = await Domain.findOne({ _id: domainId, projectId });
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
  }

  if (
    [DomainStatus.VERIFYING, DomainStatus.ACTIVATING, DomainStatus.REMOVING].includes(domain.status)
  ) {
    return { success: false, error: DOMAIN_OPERATION_IN_PROGRESS_COPY };
  }

  // VERIFIED domains may already have been routed by a release whose final
  // status write failed, so both states use idempotent route cleanup.
  if ([DomainStatus.VERIFIED, DomainStatus.ACTIVE].includes(domain.status)) {
    const queue = opts.queue === undefined ? getDeploymentQueue() : opts.queue;
    if (!queue) {
      return { success: false, error: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY };
    }

    const operationId = createDomainOperationId();
    const claimed = await Domain.findOneAndUpdate(
      {
        _id: domainId,
        projectId,
        status: { $in: [DomainStatus.VERIFIED, DomainStatus.ACTIVE] },
      },
      {
        $set: {
          status: DomainStatus.REMOVING,
          operationId,
          operationError: null,
          operationStartedAt: new Date(),
          operationCompletedAt: null,
        },
      },
      { new: true },
    ).lean();
    if (!claimed) {
      return { success: false, error: 'Domain state changed before removal could be queued.' };
    }
    const lifecycleVersion = await ensureLifecycleVersion(claimed);

    try {
      await enqueueJob(
        queue,
        JobType.REMOVE_DOMAIN,
        {
          version: 2,
          correlationId: opts.correlationId,
          actorId,
          actorRole: 'USER',
          domainId: domainId.toString(),
          projectId: claimed.projectId.toString(),
          hostname: claimed.hostnameNormalized,
          lifecycleVersion,
          operationId,
          previousStatus: domain.status,
        },
        { jobId: domainJobId('remove', domainId, operationId) },
      );
    } catch (err) {
      logger.warn('Domain: failed to enqueue route removal', {
        domainId: domainId.toString(),
        error: err.message,
      });
      await Domain.updateOne(
        { _id: domainId, status: DomainStatus.REMOVING, operationId },
        {
          $set: {
            status: domain.status,
            operationError: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY,
            operationCompletedAt: new Date(),
          },
        },
      );
      return { success: false, error: DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY };
    }

    await writeAuditEvent({
      action: 'domain.removal_started',
      outcome: AuditOutcome.SUCCESS,
      actorId,
      targetType: 'domain',
      targetId: domainId.toString(),
      sourceIp: opts.sourceIp,
      correlationId: opts.correlationId,
      metadata: {
        hostname: claimed.hostnameNormalized,
        projectId: claimed.projectId.toString(),
      },
    }).catch((err) => {
      logger.warn('Domain: removal-start audit event could not be persisted', {
        domainId: domainId.toString(),
        error: err.message,
      });
    });

    await releaseCustomHostname(domain, opts);
    return { success: true, queued: true };
  }

  await Domain.updateOne(
    { _id: domainId },
    {
      $set: {
        status: DomainStatus.REMOVED,
        removedAt: new Date(),
        operationId: null,
        operationError: null,
        operationCompletedAt: new Date(),
      },
    },
  );

  await writeAuditEvent({
    action: 'domain.removed',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'domain',
    targetId: domainId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: {
      hostnameNormalized: domain.hostnameNormalized,
      projectId: domain.projectId.toString(),
    },
  });

  await releaseCustomHostname(domain, opts);
  return { success: true, queued: false };
}

// ─── Query helpers ─────────────────────────────────────────────────────────────

export async function getProjectDomains(projectId) {
  return Domain.find({
    projectId,
    status: { $ne: DomainStatus.REMOVED },
  })
    .sort({ createdAt: -1 })
    .lean();
}

export async function getProjectDomainStatuses(projectId) {
  return Domain.find({ projectId, status: { $ne: DomainStatus.REMOVED } })
    .select('_id status operationStartedAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Domains past ownership verification, for the admin tunnel screen.
 *
 * Separate from the approval queue: the current lifecycle activates verified
 * domains automatically and no longer produces PENDING_ADMIN_APPROVAL, so an
 * admin would otherwise have nowhere to record a tunnel for them.
 */
export async function getRoutableDomains({ search } = {}) {
  return Domain.find({
    status: {
      $in: [
        DomainStatus.VERIFIED,
        DomainStatus.PENDING_ADMIN_APPROVAL,
        DomainStatus.ACTIVATING,
        DomainStatus.ACTIVE,
      ],
    },
    ...(await domainSearchFilter(search)),
  })
    .populate('projectId', 'name slug')
    .sort({ createdAt: 1 })
    .lean();
}

// Paged because the approval screen runs a live DNS lookup for every row it shows.
export async function getPendingApprovalDomains({ page = 1, limit = 20, search } = {}) {
  const query = {
    status: DomainStatus.PENDING_ADMIN_APPROVAL,
    ...(await domainSearchFilter(search)),
  };
  const [domains, total] = await Promise.all([
    Domain.find(query)
      .populate('projectId', 'name slug')
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Domain.countDocuments(query),
  ]);
  return { domains, total, page, limit };
}

// Matches the hostname, or the name or slug of the project that owns it.
async function domainSearchFilter(search) {
  const safeSearch = normalizeAdminSearch(search);
  if (!safeSearch) {
    return {};
  }
  const regex = escapedSearchRegex(safeSearch);
  const projectIds = await Project.find({ $or: [{ name: regex }, { slug: regex }] }).distinct(
    '_id',
  );
  return { $or: [{ hostnameNormalized: regex }, { projectId: { $in: projectIds } }] };
}

// ─── Live DNS re-check (admin approval screen) ─────────────────────────────────

const VERIFICATION_SUBDOMAIN_PREFIX = '_hellodeploy-verify.';
const DNS_LOOKUP_TIMEOUT_MS = 3_000;

/**
 * Look up the TXT records currently published at the verification subdomain,
 * for display on the admin approval screen. DNS TXT records are public once
 * published, so this is safe to show directly — unlike the stored
 * `verificationTokenHash`, which is never surfaced anywhere. Not a substitute
 * for the system's own verification (VERIFY_DOMAIN job) — just corroborating
 * evidence so an admin can independently confirm the record is still
 * published before approving.
 *
 * Returns null on no record / lookup failure / timeout — all shown the same
 * way to the admin ("no record found"), since the distinction isn't actionable.
 *
 * @param {string} hostname
 * @param {(name: string) => Promise<string[][]>} [dnsResolveTxt] - injectable for tests
 * @returns {Promise<string[]|null>}
 */
export async function getLiveVerificationTxtRecords(hostname, dnsResolveTxt = resolveTxt) {
  const lookupName = `${VERIFICATION_SUBDOMAIN_PREFIX}${hostname}`;
  try {
    const records = await Promise.race([
      dnsResolveTxt(lookupName),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_LOOKUP_TIMEOUT_MS),
      ),
    ]);
    return records.map((parts) => parts.join(''));
  } catch {
    return null;
  }
}

// ─── Tunnel assignment (admin) ─────────────────────────────────────────────────

const TUNNEL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Record the Cloudflare tunnel that carries a custom domain.
 *
 * Creating the tunnel cannot be automated: its DNS route is a proxied CNAME to
 * <tunnelId>.cfargotunnel.com, which Cloudflare accepts only inside the account
 * that owns both the tunnel and the zone. An administrator creates it with the
 * domain owner's credentials and records the id here, which is what lets the
 * owner see the CNAME they need to publish.
 */
export async function setDomainTunnel(domainId, tunnelIdRaw, adminId, opts = {}) {
  const tunnelId = String(tunnelIdRaw ?? '')
    .trim()
    .toLowerCase();
  if (!TUNNEL_ID_PATTERN.test(tunnelId)) {
    return { success: false, error: 'Tunnel id must be a UUID, as printed by cloudflared.' };
  }

  const domain = await Domain.findById(domainId).lean();
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
  }

  // The published CNAME target changes with the tunnel, so any earlier probe
  // result describes a route that no longer applies.
  await Domain.updateOne(
    { _id: domainId },
    {
      $set: {
        tunnelId,
        routingState: DomainRoutingState.UNKNOWN,
        routingCheckedAt: null,
        routingDetail: null,
      },
    },
  );

  await writeAuditEvent({
    action: 'domain.tunnel_assigned',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    projectId: domain.projectId,
    targetType: 'domain',
    targetId: domainId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { hostname: domain.hostnameNormalized, tunnelId },
  });

  return { success: true, tunnelId };
}

// ─── Cloudflare custom hostnames ───────────────────────────────────────────────

const CONNECTABLE_DOMAIN_STATUSES = [
  DomainStatus.VERIFIED,
  DomainStatus.ACTIVATING,
  DomainStatus.ACTIVE,
];
const CUSTOM_HOSTNAMES_UNAVAILABLE_COPY =
  'Automatic connection is not available on this platform yet. An administrator will prepare your record.';
const CUSTOM_HOSTNAME_LIMIT_COPY =
  "HelloDeploy can't connect more custom domains right now. Your domain is verified and nothing is lost: contact support and we'll connect it.";
const CUSTOM_HOSTNAME_CONNECT_FAILED_COPY =
  "HelloDeploy couldn't prepare your DNS record just now. Try again in a minute; contact support if it keeps happening.";

/**
 * The CNAME target an owner points their domain at, or null while none exists.
 * Custom-hostname domains share one platform target; legacy domains have a
 * per-domain tunnel made by an administrator.
 */
export function routingTargetFor(domain, target = env.CUSTOM_HOSTNAME_TARGET) {
  if (domain.cfCustomHostnameId && target) {
    return target;
  }
  if (domain.tunnelId) {
    return `${domain.tunnelId}.cfargotunnel.com`;
  }
  return null;
}

function resolveCustomHostnameClient(opts) {
  return opts.customHostnames === undefined ? defaultCustomHostnameClient() : opts.customHostnames;
}

// Register (or refresh) the hostname with Cloudflare and store what it reports.
// Resolves to { domain } or { failure: 'limit' | 'unavailable' }.
async function syncCustomHostname(domain, client) {
  if (domain.cfCustomHostnameId) {
    const refreshed = await client.get(domain.cfCustomHostnameId);
    if (!refreshed.ok) {
      logCustomHostnameFailure('refresh', domain.hostnameNormalized, refreshed);
      return { failure: 'unavailable' };
    }
    return { domain: await storeCustomHostname(domain, refreshed.result) };
  }

  // Fail closed: an unknown count must not risk registering a billed hostname.
  const before = await client.count();
  if (!before.ok) {
    logCustomHostnameFailure('count', domain.hostnameNormalized, before);
    return { failure: 'unavailable' };
  }
  if (before.result >= CUSTOM_HOSTNAME_LIMIT) {
    logger.warn('CustomHostname: platform limit reached', {
      hostname: domain.hostnameNormalized,
      count: before.result,
      limit: CUSTOM_HOSTNAME_LIMIT,
    });
    return { failure: 'limit' };
  }

  const registered = await client.register(domain.hostnameNormalized);
  if (!registered.ok) {
    logCustomHostnameFailure('register', domain.hostnameNormalized, registered);
    return { failure: 'unavailable' };
  }

  // Two owners registering at the same moment can both pass the first check;
  // whoever finds the zone over the limit afterwards backs out its own entry.
  const after = await client.count();
  if (!after.ok || after.result > CUSTOM_HOSTNAME_LIMIT) {
    await client.remove(registered.result.id);
    logger.warn('CustomHostname: platform limit reached', {
      hostname: domain.hostnameNormalized,
      count: after.ok ? after.result : null,
      limit: CUSTOM_HOSTNAME_LIMIT,
    });
    return { failure: 'limit' };
  }
  return { domain: await storeCustomHostname(domain, registered.result) };
}

function storeCustomHostname(domain, result) {
  return Domain.findOneAndUpdate(
    { _id: domain._id },
    { $set: toCustomHostnameFields(result) },
    { new: true },
  ).lean();
}

// Best effort: a hostname left on the zone is only a stale entry, and must not
// block the owner from removing the domain.
async function releaseCustomHostname(domain, opts) {
  if (!domain.cfCustomHostnameId) {
    return;
  }
  const client = resolveCustomHostnameClient(opts);
  if (!client) {
    return;
  }
  const response = await client.remove(domain.cfCustomHostnameId);
  if (!response.ok) {
    logCustomHostnameFailure('remove', domain.hostnameNormalized, response);
    return;
  }
  await Domain.updateOne(
    { _id: domain._id },
    {
      $set: {
        cfCustomHostnameId: null,
        cfHostnameStatus: null,
        cfSslStatus: null,
        cfValidationRecords: [],
      },
    },
  );
}

/** Owner action: get the DNS record for a verified domain without an admin. */
export async function connectCustomHostname(domainId, projectId, actorId, opts = {}) {
  const client = resolveCustomHostnameClient(opts);
  if (!client) {
    return { success: false, error: CUSTOM_HOSTNAMES_UNAVAILABLE_COPY };
  }
  const domain = await Domain.findOne({ _id: domainId, projectId }).lean();
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
  }
  if (!CONNECTABLE_DOMAIN_STATUSES.includes(domain.status)) {
    return { success: false, error: 'Verify that you own this domain first.' };
  }

  const wasRegistered = Boolean(domain.cfCustomHostnameId);
  const synced = await syncCustomHostname(domain, client);
  if (synced.failure === 'limit') {
    return { success: false, error: CUSTOM_HOSTNAME_LIMIT_COPY };
  }
  if (synced.failure) {
    return { success: false, error: CUSTOM_HOSTNAME_CONNECT_FAILED_COPY };
  }
  const updated = synced.domain;
  if (!wasRegistered) {
    await writeAuditEvent({
      action: 'domain.custom_hostname_registered',
      outcome: AuditOutcome.SUCCESS,
      actorId,
      projectId: domain.projectId,
      targetType: 'domain',
      targetId: domainId.toString(),
      sourceIp: opts.sourceIp,
      correlationId: opts.correlationId,
      metadata: {
        hostname: updated.hostnameNormalized,
        customHostnameId: updated.cfCustomHostnameId,
      },
    });
  }
  return { success: true, routingTarget: routingTargetFor(updated) };
}

// ─── Routing reachability probe ────────────────────────────────────────────────

const ROUTE_HEADER = 'x-hellodeploy-route';
export const CERTIFICATE_PENDING_DETAIL =
  'Your record is in place. Cloudflare is preparing the secure certificate for your address, which usually takes a few minutes. Check routing again shortly.';
export const ROUTING_RECORD_NOT_READY_DETAIL =
  "Not connected yet, and that's expected for now. Your domain still points to its old host (often your registrar's parking page), and your HelloDeploy record isn't ready. You don't need to do anything yet: the record and step-by-step instructions will appear on this page when it is.";
const ROUTING_PROBE_TIMEOUT_MS = 15_000;

/**
 * Turn one probe result into a routing state.
 *
 * Comparing DNS records cannot do this job: behind Cloudflare's proxy a
 * correctly configured domain resolves to Cloudflare's addresses and never to
 * this platform, so record matching reports working domains as broken. Only
 * what comes back from the hostname itself distinguishes these cases.
 *
 * Exported for tests — it is pure, so every branch is checkable without HTTP.
 *
 * @param {{ error?: string, status?: number, routeHeader?: string|null }} observed
 * @param {string} hostname
 */
export function classifyRoutingProbe(observed, hostname) {
  if (observed.error) {
    return {
      state: DomainRoutingState.NOT_POINTED,
      detail: `We couldn't reach ${hostname} at all. Check that its DNS records exist and have finished updating, which can take a few minutes. (${observed.error})`,
    };
  }

  // Cloudflare signals its own edge-to-origin failures in the 52x/530 range,
  // and those pages never carry our header, so they must be read before
  // concluding that some other server answered.
  if (observed.status === 530) {
    return {
      state: DomainRoutingState.TUNNEL_DOWN,
      detail:
        "Your domain points to HelloDeploy, but the connection for it isn't running yet. If you just added the record, wait a few minutes and check again; otherwise contact support. (HTTP 530)",
    };
  }
  if (observed.status >= 521 && observed.status <= 526) {
    return {
      state: DomainRoutingState.NOT_POINTED,
      detail: `Your domain still sends visitors to another server, usually old A or CNAME records for this name at your DNS provider. Replace them with the CNAME record shown above. (Cloudflare HTTP ${observed.status})`,
    };
  }

  if (observed.routeHeader === hostname) {
    return { state: DomainRoutingState.LIVE, detail: null };
  }

  return {
    state: DomainRoutingState.FOREIGN,
    detail: observed.routeHeader
      ? `This address is connected to a different HelloDeploy site (${observed.routeHeader}). Check that the CNAME record uses the target shown above.`
      : `Another server answered for ${hostname} instead of HelloDeploy. Remove the old A or CNAME records for this name and add the CNAME record shown above. (HTTP ${observed.status})`,
  };
}

/**
 * Probe a domain end to end and store what public traffic actually finds.
 *
 * Deliberately user-triggered rather than polled: the domains page refreshes
 * every two seconds, which is far too often to make outbound requests.
 *
 * @param {(url: string, init?: object) => Promise<Response>} [fetchImpl] - injectable for tests
 */
export async function checkDomainRouting(domainId, projectId, fetchImpl = fetch, opts = {}) {
  let domain = await Domain.findOne({ _id: domainId, projectId }).lean();
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
  }
  // Domains verified before custom hostnames were enabled get their record
  // here; for registered ones this refreshes Cloudflare's validation status.
  const client = resolveCustomHostnameClient(opts);
  if (client && CONNECTABLE_DOMAIN_STATUSES.includes(domain.status)) {
    const synced = await syncCustomHostname(domain, client);
    if (synced.domain) {
      domain = synced.domain;
    }
  }

  const hostname = domain.hostnameNormalized;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTING_PROBE_TIMEOUT_MS);
  let observed;
  try {
    const response = await fetchImpl(`https://${hostname}/`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'HelloDeploy-RoutingCheck/1' },
    });
    observed = { status: response.status, routeHeader: response.headers.get(ROUTE_HEADER) };
  } catch (err) {
    observed = { error: err.name === 'AbortError' ? 'the request timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }

  const classified = classifyRoutingProbe(observed, hostname);
  const { state } = classified;
  // Before the CNAME target exists the owner has nothing to change, so a
  // failed check is expected and must not read as an instruction.
  const recordReady = Boolean(routingTargetFor(domain));
  let detail = classified.detail;
  if (!recordReady && state !== DomainRoutingState.LIVE) {
    detail = ROUTING_RECORD_NOT_READY_DETAIL;
  } else if (
    state !== DomainRoutingState.LIVE &&
    domain.cfHostnameStatus === 'active' &&
    domain.cfSslStatus !== 'active'
  ) {
    // Cloudflare has seen the owner's CNAME; only the certificate is missing.
    detail = CERTIFICATE_PENDING_DETAIL;
  }
  const checkedAt = new Date();
  await Domain.updateOne(
    { _id: domainId, projectId },
    { $set: { routingState: state, routingCheckedAt: checkedAt, routingDetail: detail } },
  );
  logger.info('Domain routing checked', { hostname, state });

  return { success: true, state, detail, checkedAt, recordReady };
}
