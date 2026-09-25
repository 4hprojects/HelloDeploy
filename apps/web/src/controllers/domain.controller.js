import { asyncHandler } from '../utils/async-handler.js';
import {
  stashPendingDomainVerification,
  consumePendingDomainVerification,
} from '../utils/pending-domain-verification.js';
import {
  addDomain,
  requestVerification,
  requestDomainActivation,
  removeDomain,
  getProjectDomains,
  getProjectDomainStatuses,
  getPendingApprovalDomains,
  getRoutableDomains,
  approveDomain,
  rejectDomain,
  getLiveVerificationTxtRecords,
  setDomainTunnel,
  checkDomainRouting,
} from '../services/domain.service.js';

// ─── Project-scoped domain management ─────────────────────────────────────────

export const getDomains = asyncHandler(async (req, res) => {
  const project = req.project;
  const domains = await getProjectDomains(project._id);
  const pending = consumePendingDomainVerification(req);

  res.render('pages/projects/domains', {
    title: `Custom Domains – ${project.name}`,
    project,
    membership: req.membership,
    domains,
    verificationToken: pending.token,
    pendingHostname: pending.hostname,
  });
});

export const postAddDomain = asyncHandler(async (req, res) => {
  const project = req.project;
  const { hostname } = req.body;

  const result = await addDomain(project._id, hostname, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    const domains = await getProjectDomains(project._id);
    const pending = consumePendingDomainVerification(req);
    return res.status(400).render('pages/projects/domains', {
      title: `Custom Domains – ${project.name}`,
      project,
      membership: req.membership,
      domains,
      verificationToken: pending.token,
      pendingHostname: pending.hostname,
      errors: { hostname: result.error },
      values: { hostname },
    });
  }

  stashPendingDomainVerification(req, {
    hostname: result.domain.hostnameNormalized,
    token: result.verificationToken,
  });

  req.flash(
    'success',
    `Domain ${result.domain.hostnameNormalized} added. See the TXT record instructions below.`,
  );
  res.redirect(`/projects/${project.slug}/domains#dns-record-instructions`);
});

export const postVerifyDomain = asyncHandler(async (req, res) => {
  const { domainId } = req.params;
  const project = req.project;

  const result = await requestVerification(domainId, project._id, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash(
      'success',
      'DNS verification started. This page will update automatically when the check finishes.',
    );
  }

  res.redirect(`/projects/${project.slug}/domains`);
});

export const postActivateDomain = asyncHandler(async (req, res) => {
  const { domainId } = req.params;
  const project = req.project;
  const result = await requestDomainActivation(domainId, project._id, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  req.flash(
    result.success ? 'success' : 'error',
    result.success
      ? 'Domain activation started. This page will update automatically.'
      : result.error,
  );
  res.redirect(`/projects/${project.slug}/domains`);
});

export const getDomainStatuses = asyncHandler(async (req, res) => {
  const domains = await getProjectDomainStatuses(req.project._id);
  res.set('Cache-Control', 'no-store');
  res.json({
    signature: domains
      .map((domain) => `${domain._id}:${domain.status}:${new Date(domain.updatedAt).getTime()}`)
      .join('|'),
  });
});

export const postRemoveDomain = asyncHandler(async (req, res) => {
  const { domainId } = req.params;
  const project = req.project;

  const result = await removeDomain(domainId, project._id, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash(
      'success',
      result.queued
        ? 'Domain removal started. This page will update automatically.'
        : 'Domain removed.',
    );
  }

  res.redirect(`/projects/${project.slug}/domains`);
});

// ─── Admin: domain approval queue ─────────────────────────────────────────────

export const getAdminDomains = asyncHandler(async (req, res) => {
  const domains = await getPendingApprovalDomains();
  const routableDomains = await getRoutableDomains();

  // Live re-check, shown alongside the original verification timestamp so
  // an admin can independently confirm the record is still published before
  // approving — not a substitute for the system's own verification.
  const liveTxtRecordsById = new Map(
    await Promise.all(
      domains.map(async (d) => [
        d._id.toString(),
        await getLiveVerificationTxtRecords(d.hostnameNormalized),
      ]),
    ),
  );

  res.render('pages/admin/domains', {
    routableDomains,
    title: 'Domain Approval Queue',
    domains,
    liveTxtRecordsById,
  });
});

export const postCheckDomainRouting = asyncHandler(async (req, res) => {
  const { domainId } = req.params;
  const project = req.project;

  const result = await checkDomainRouting(domainId, project._id);

  if (!result.success) {
    req.flash('error', result.error);
  } else if (result.state === 'LIVE') {
    req.flash('success', 'This domain is live — public traffic reaches your app.');
  } else {
    req.flash('error', result.detail);
  }

  res.redirect(`/projects/${project.slug}/domains`);
});

export const postSetDomainTunnel = asyncHandler(async (req, res) => {
  const { domainId } = req.params;

  const result = await setDomainTunnel(domainId, req.body.tunnelId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Tunnel recorded. The domain owner can now publish the CNAME.');
  }

  res.redirect('/admin/domains');
});

export const postApproveDomain = asyncHandler(async (req, res) => {
  const { domainId } = req.params;

  const result = await approveDomain(domainId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Domain approved. Routing activation has been queued.');
  }

  res.redirect('/admin/domains');
});

export const postRejectDomain = asyncHandler(async (req, res) => {
  const { domainId } = req.params;
  const { reason } = req.body;

  const result = await rejectDomain(domainId, req.session.user.id, reason, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Domain rejected.');
  }

  res.redirect('/admin/domains');
});
