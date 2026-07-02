import { randomBytes, createHash } from 'node:crypto';
import { Domain, Project } from '@hellodeploy/database';
import { DomainStatus, DomainType, AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { getDeploymentQueue } from '../queue/client.js';
import { JobType } from '@hellodeploy/contracts';

// ─── Hostname normalization ────────────────────────────────────────────────────

const PLATFORM_DOMAINS = new Set(['hellodeploy.online', 'hellodeploy.com', 'localhost']);
const DOMAIN_QUEUE_UNAVAILABLE_COPY =
  'Domain verification queue is unavailable. Ask an administrator to check Redis and worker health, then try again.';
const DOMAIN_ROUTE_QUEUE_UNAVAILABLE_COPY =
  'Could not queue domain route activation. Ask an administrator to check Redis and worker health, then approve the domain again.';

function domainVerificationStateCopy(status) {
  if (status === DomainStatus.PENDING_ADMIN_APPROVAL) {
    return 'DNS is already verified and this domain is awaiting admin approval.';
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
    await Domain.updateOne(
      { _id: existing._id },
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
        },
      },
    );
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
  const domain = await Domain.findOne({ _id: domainId, projectId }).lean();
  if (!domain) {
    return { success: false, error: 'Domain not found.' };
  }

  if (domain.status !== DomainStatus.PENDING_VERIFICATION) {
    return { success: false, error: domainVerificationStateCopy(domain.status) };
  }

  const queue = getDeploymentQueue();
  if (!queue) {
    return { success: false, error: DOMAIN_QUEUE_UNAVAILABLE_COPY };
  }

  await enqueueJob(
    queue,
    JobType.VERIFY_DOMAIN,
    {
      version: 1,
      correlationId: opts.correlationId,
      actorId,
      actorRole: 'USER',
      domainId: domainId.toString(),
      projectId: domain.projectId.toString(),
      hostname: domain.hostnameNormalized,
    },
    { jobId: `verify-domain-${domainId}` },
  );

  return { success: true };
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

  const queue = getDeploymentQueue();
  if (!queue) {
    return { success: false, error: DOMAIN_QUEUE_UNAVAILABLE_COPY };
  }

  await Domain.updateOne(
    { _id: domainId },
    {
      $set: {
        approvedBy: adminId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    },
  );

  try {
    await enqueueJob(
      queue,
      JobType.VERIFY_DOMAIN,
      {
        version: 1,
        correlationId: opts.correlationId,
        actorId: adminId,
        actorRole: 'SUPER_ADMIN',
        domainId: domainId.toString(),
        projectId: domain.projectId.toString(),
        hostname: domain.hostnameNormalized,
        activateRoute: true, // signal to worker to activate nginx route
      },
      { jobId: `activate-domain-${domainId}` },
    );
  } catch {
    await Domain.updateOne(
      { _id: domainId },
      {
        $set: {
          approvedBy: null,
          approvedAt: null,
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

  // Remove the nginx route if domain was active
  if (domain.status === DomainStatus.ACTIVE) {
    const queue = getDeploymentQueue();
    if (queue) {
      await enqueueJob(
        queue,
        JobType.VERIFY_DOMAIN,
        {
          version: 1,
          correlationId: opts.correlationId,
          actorId,
          actorRole: 'USER',
          domainId: domainId.toString(),
          projectId: domain.projectId.toString(),
          hostname: domain.hostnameNormalized,
          removeRoute: true,
        },
        { jobId: `remove-domain-${domainId}` },
      );
    }
  }

  await Domain.updateOne(
    { _id: domainId },
    { $set: { status: DomainStatus.REMOVED, removedAt: new Date() } },
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

  return { success: true };
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

export async function getPendingApprovalDomains() {
  return Domain.find({ status: DomainStatus.PENDING_ADMIN_APPROVAL })
    .populate('projectId', 'name slug')
    .sort({ createdAt: 1 })
    .lean();
}
