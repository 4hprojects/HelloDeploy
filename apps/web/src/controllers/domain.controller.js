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

export async function getDomains(req, res) {
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
}

export async function postAddDomain(req, res) {
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

  req.flash('success', `Domain ${result.domain.hostnameNormalized} added. See the TXT record instructions below.`);
  res.redirect(`/projects/${project.slug}/domains`);
}

export async function postVerifyDomain(req, res) {
  const { domainId } = req.params;
  const project = req.project;

  const result = await requestVerification(domainId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Verification check queued. This may take a few minutes for DNS to propagate.');
  }

  res.redirect(`/projects/${project.slug}/domains`);
}

export async function postRemoveDomain(req, res) {
  const { domainId } = req.params;
  const project = req.project;

  const result = await removeDomain(domainId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Domain removed.');
  }

  res.redirect(`/projects/${project.slug}/domains`);
}

// ─── Admin: domain approval queue ─────────────────────────────────────────────

export async function getAdminDomains(req, res) {
  const domains = await getPendingApprovalDomains();

  res.render('pages/admin/domains', {
    title: 'Domain Approval Queue',
    domains,
  });
}

export async function postApproveDomain(req, res) {
  const { domainId } = req.params;

  const result = await approveDomain(domainId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Domain approved and routing activated.');
  }

  res.redirect('/admin/domains');
}

export async function postRejectDomain(req, res) {
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
}
