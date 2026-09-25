import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { Domain, Project } from '@hellodeploy/database';
import { DomainStatus, DomainType, DomainRoutingState, AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent, logger } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { getDeploymentQueue } from '../queue/client.js';
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
export async function getRoutableDomains() {
  return Domain.find({
    status: {
      $in: [
        DomainStatus.VERIFIED,
        DomainStatus.PENDING_ADMIN_APPROVAL,
        DomainStatus.ACTIVATING,
        DomainStatus.ACTIVE,
      ],
    },
  })
    .populate('projectId', 'name slug')
    .sort({ createdAt: 1 })
    .lean();
}

export async function getPendingApprovalDomains() {
  return Domain.find({ status: DomainStatus.PENDING_ADMIN_APPROVAL })
    .populate('projectId', 'name slug')
    .sort({ createdAt: 1 })
    .lean();
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
    targetType: 'domain',
    targetId: domainId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { hostname: domain.hostnameNormalized, tunnelId },
  });

  return { success: true, tunnelId };
}

// ─── Routing reachability probe ────────────────────────────────────────────────

const ROUTE_HEADER = 'x-hellodeploy-route';
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
      detail: `Could not reach ${hostname}: ${observed.error}`,
    };
  }

  // Cloudflare signals its own edge-to-origin failures in the 52x/530 range,
  // and those pages never carry our header, so they must be read before
  // concluding that some other server answered.
  if (observed.status === 530) {
    return {
      state: DomainRoutingState.TUNNEL_DOWN,
      detail: 'Cloudflare reached no tunnel connector for this hostname (HTTP 530).',
    };
  }
  if (observed.status >= 521 && observed.status <= 526) {
    return {
      state: DomainRoutingState.NOT_POINTED,
      detail: `Cloudflare could not reach an origin for this hostname (HTTP ${observed.status}).`,
    };
  }

  if (observed.routeHeader === hostname) {
    return { state: DomainRoutingState.LIVE, detail: null };
  }

  return {
    state: DomainRoutingState.FOREIGN,
    detail: observed.routeHeader
      ? `Another HelloDeploy route answered: ${observed.routeHeader}.`
      : `A server answered (HTTP ${observed.status}) but it is not this platform.`,
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
export async function checkDomainRouting(domainId, projectId, fetchImpl = fetch) {
  const domain = await Domain.findOne({ _id: domainId, projectId }).lean();
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
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

  const { state, detail } = classifyRoutingProbe(observed, hostname);
  const checkedAt = new Date();
  await Domain.updateOne(
    { _id: domainId, projectId },
    { $set: { routingState: state, routingCheckedAt: checkedAt, routingDetail: detail } },
  );
  logger.info('Domain routing checked', { hostname, state });

  return { success: true, state, detail, checkedAt };
}
