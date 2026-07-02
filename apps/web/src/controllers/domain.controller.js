import { asyncHandler } from '../utils/async-handler.js';
import {
  addDomain,
  requestVerification,
  removeDomain,
  getProjectDomains,
  getPendingApprovalDomains,
  approveDomain,
  rejectDomain,
} from '../services/domain.service.js';

// ─── Project-scoped domain management ─────────────────────────────────────────

export const getDomains = asyncHandler(async (req, res) => {
  const project = req.project;
  const domains = await getProjectDomains(project._id);

  res.render('pages/projects/domains', {
    title: `Custom Domains – ${project.name}`,
    project,
    membership: req.membership,
    domains,
    verificationToken: req.session.pendingDomainToken ?? null,
    pendingHostname: req.session.pendingDomainHostname ?? null,
  });

  // Clear one-time token after rendering
  delete req.session.pendingDomainToken;
  delete req.session.pendingDomainHostname;
});

export const postAddDomain = asyncHandler(async (req, res) => {
  const project = req.project;
  const { hostname } = req.body;

  const result = await addDomain(project._id, hostname, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}/domains`);
  }

  // Store token in session for one-time display on the redirect page
  req.session.pendingDomainToken = result.verificationToken;
  req.session.pendingDomainHostname = result.domain.hostnameNormalized;

  req.flash(
    'success',
    `Domain ${result.domain.hostnameNormalized} added. See the TXT record instructions below.`,
  );
  res.redirect(`/projects/${project.slug}/domains`);
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
      'Verification check queued. DNS can take 1-30 minutes to propagate; if it is not approved after the check finishes, confirm the TXT record name/value and try again.',
    );
  }

  res.redirect(`/projects/${project.slug}/domains`);
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
    req.flash('success', 'Domain removed.');
  }

  res.redirect(`/projects/${project.slug}/domains`);
});

// ─── Admin: domain approval queue ─────────────────────────────────────────────

export const getAdminDomains = asyncHandler(async (req, res) => {
  const domains = await getPendingApprovalDomains();

  res.render('pages/admin/domains', {
    title: 'Domain Approval Queue',
    domains,
  });
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
