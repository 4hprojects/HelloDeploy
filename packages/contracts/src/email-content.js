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
  throw new Error(`Unsupported email kind: ${kind}`);
}
