export function escapeEmailHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function sanitizeEmailSubject(value) {
  // Header line breaks must never be derived from user-controlled names.
  // eslint-disable-next-line no-control-regex
  const controlCharacters = /[\u0000-\u001f\u007f]+/g;
  return String(value ?? '')
    .replace(controlCharacters, ' ')
    .trim();
}

export function buildEmailContent(kind, payload) {
  const firstName = escapeEmailHtml(payload.firstName);
  if (kind === 'email-verification') {
    const url = escapeEmailHtml(payload.verificationUrl);
    return {
      subject: 'Verify your HelloDeploy email address',
      html: `<p>Hi ${firstName},</p><p>Thanks for creating a HelloDeploy account. Please verify your email address:</p><p><a href="${url}">Verify Email Address</a></p><p>This link expires in 24 hours and can only be used once.</p><p>If you did not create an account, you can ignore this email.</p>`,
      text: `Hi ${payload.firstName},\n\nVerify your email: ${payload.verificationUrl}\n\nThis link expires in 24 hours.`,
    };
  }
  if (kind === 'password-reset') {
    const code = escapeEmailHtml(payload.resetCode);
    return {
      subject: 'Reset your HelloDeploy password',
      html: `<p>Hi ${firstName},</p><p>You requested a password reset. Enter the code below on the HelloDeploy website:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 1 hour and can only be used once.</p><p>If you did not request a password reset, you can ignore this email.</p>`,
      text: `Hi ${payload.firstName},\n\nYour password reset code: ${payload.resetCode}\n\nThis code expires in 1 hour.`,
    };
  }
  if (kind === 'password-changed') {
    return {
      subject: 'Your HelloDeploy password has been changed',
      html: `<p>Hi ${firstName},</p><p>Your HelloDeploy password was successfully changed.</p><p>If you did not make this change, please contact support immediately.</p>`,
      text: `Hi ${payload.firstName},\n\nYour HelloDeploy password was changed. If you did not do this, contact support immediately.`,
    };
  }
  if (kind === 'project-paused') {
    const projectName = escapeEmailHtml(payload.projectName);
    const projectUrl = escapeEmailHtml(payload.projectUrl);
    return {
      subject: `Auto-deploy paused for ${sanitizeEmailSubject(payload.projectName)}`,
      html: `<p>Hi ${firstName},</p><p>HelloDeploy detected a high-risk file change in a push to <strong>${projectName}</strong> and paused automatic deployment as a precaution.</p><p>Review the change and deploy manually when you're ready: <a href="${projectUrl}">${projectUrl}</a></p>`,
      text: `Hi ${payload.firstName},\n\nHelloDeploy paused automatic deployment for ${payload.projectName} after detecting a high-risk file change. Review and deploy manually: ${payload.projectUrl}`,
    };
  }
  if (kind === 'approval-requested') {
    const projectName = escapeEmailHtml(payload.projectName);
    const reviewUrl = escapeEmailHtml(payload.reviewUrl);
    return {
      subject: `Review needed: ${sanitizeEmailSubject(payload.projectName)}`,
      html: `<p>Hi ${firstName},</p><p><strong>${projectName}</strong> is waiting for project review.</p><p><a href="${reviewUrl}">Open the approval queue</a></p><p>If automatic approval is on and nobody reviews it within ${payload.provisionalAfterMinutes} minutes, it goes live provisionally with reduced limits until an admin confirms or suspends it.</p>`,
      text: `Hi ${payload.firstName},\n\n${payload.projectName} is waiting for project review: ${payload.reviewUrl}\n\nIf automatic approval is on and nobody reviews it within ${payload.provisionalAfterMinutes} minutes, it goes live provisionally with reduced limits until an admin confirms or suspends it.`,
    };
  }
  if (kind === 'deployment-result') {
    const projectName = escapeEmailHtml(payload.projectName);
    const dashboardUrl = escapeEmailHtml(payload.dashboardUrl);
    const shortSha = escapeEmailHtml(payload.commitSha?.slice(0, 7) ?? '?');
    const success = payload.status === 'HEALTHY';
    const outcome = success ? 'succeeded' : 'failed';
    const failure = payload.failureMessage
      ? `<p><strong>${escapeEmailHtml(payload.failureMessage)}</strong></p>`
      : '';
    const action = payload.failureAction ? `<p>${escapeEmailHtml(payload.failureAction)}</p>` : '';
    const details = payload.failureCode
      ? `<p style="color:#888;font-size:12px;">Technical details: <code>${escapeEmailHtml(payload.failureCode)}</code>${payload.failureSummary ? ` — ${escapeEmailHtml(String(payload.failureSummary).slice(0, 200))}` : ''}</p>`
      : '';
    return {
      subject: `Deployment #${payload.sequenceNumber} ${outcome} – ${sanitizeEmailSubject(payload.projectName)}`,
      html: `<p>Hi ${firstName},</p><p>Deployment <strong>#${payload.sequenceNumber}</strong> of <strong>${projectName}</strong> ${success ? 'is now live' : 'failed'}.</p><p>Commit: <code>${shortSha}</code></p>${failure}${action}${details}<p><a href="${dashboardUrl}">View ${success ? 'deployments' : 'deployment logs'}</a></p>`,
      text: `Deployment #${payload.sequenceNumber} of ${payload.projectName} ${outcome} (commit ${payload.commitSha?.slice(0, 7) ?? '?'}).\n\n${payload.failureMessage ? `${payload.failureMessage} ${payload.failureAction ?? ''}` : ''}\n\nView: ${payload.dashboardUrl}`,
    };
  }
  if (kind === 'project-invite') {
    const inviterName = escapeEmailHtml(payload.inviterName);
    const projectName = escapeEmailHtml(payload.projectName);
    const roleLabel = escapeEmailHtml(roleLabelFor(payload.role));
    const signupUrl = escapeEmailHtml(payload.signupUrl);
    const email = escapeEmailHtml(payload.email);
    return {
      subject: `${sanitizeEmailSubject(payload.inviterName)} invited you to ${sanitizeEmailSubject(payload.projectName)} on HelloDeploy`,
      html: `<p>Hi,</p><p>${inviterName} added you to <strong>${projectName}</strong> on HelloDeploy as a ${roleLabel}.</p><p>Create your account with <strong>${email}</strong> and you'll join the project as soon as your email is verified:</p><p><a href="${signupUrl}">Create your HelloDeploy account</a></p><p>This invitation expires in ${payload.expiresInDays} days. If you weren't expecting it, you can ignore this email.</p>`,
      text: `Hi,\n\n${payload.inviterName} added you to ${payload.projectName} on HelloDeploy as a ${roleLabelFor(payload.role)}.\n\nCreate your account with ${payload.email} and you'll join the project once your email is verified: ${payload.signupUrl}\n\nThis invitation expires in ${payload.expiresInDays} days.`,
    };
  }
  if (kind === 'project-member-added') {
    const inviterName = escapeEmailHtml(payload.inviterName);
    const projectName = escapeEmailHtml(payload.projectName);
    const roleLabel = escapeEmailHtml(roleLabelFor(payload.role));
    const projectUrl = escapeEmailHtml(payload.projectUrl);
    return {
      subject: `You were added to ${sanitizeEmailSubject(payload.projectName)} on HelloDeploy`,
      html: `<p>Hi ${firstName},</p><p>${inviterName} added you to <strong>${projectName}</strong> as a ${roleLabel}.</p><p><a href="${projectUrl}">Open the project</a></p>`,
      text: `Hi ${payload.firstName},\n\n${payload.inviterName} added you to ${payload.projectName} as a ${roleLabelFor(payload.role)}.\n\nOpen the project: ${payload.projectUrl}`,
    };
  }
  throw new Error(`Unsupported email kind: ${kind}`);
}

function roleLabelFor(role) {
  return role === 'VIEWER' ? 'Viewer (read-only)' : 'Maintainer (can deploy)';
}
