import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';

let resend = null;

function escapeEmailHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getResendClient() {
  if (!resend && env.RESEND_API_KEY) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Send an email without putting recipient addresses or message content in logs.
 * The optional dependencies keep provider behavior deterministic in tests.
 */
async function sendEmail(
  { to, subject, html, text, kind, correlationId },
  { client = getResendClient(), log = logger } = {},
) {
  if (!client) {
    log.info('[email] Email skipped because the provider is not configured', {
      kind,
      correlationId,
    });
    return { status: 'skipped', providerMessageId: null };
  }

  const { data, error } = await client.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    log.error('[email] Email provider rejected the request', {
      kind,
      correlationId,
      providerErrorType: error.name ?? 'provider_error',
    });
    throw new Error('Email provider rejected the request.');
  }

  const providerMessageId = typeof data?.id === 'string' ? data.id : null;
  log.info('[email] Email accepted by provider', { kind, correlationId, providerMessageId });
  return { status: 'accepted', providerMessageId };
}

export async function sendVerificationEmail({ to, firstName, verificationUrl, correlationId }) {
  return sendEmail({
    to,
    kind: 'email-verification',
    correlationId,
    subject: 'Verify your HelloDeploy email address',
    html: `
      <p>Hi ${firstName},</p>
      <p>Thanks for creating a HelloDeploy account. Please verify your email address by clicking the link below:</p>
      <p><a href="${verificationUrl}">Verify Email Address</a></p>
      <p>This link expires in 24 hours and can only be used once.</p>
      <p>If you did not create an account, you can ignore this email.</p>
    `,
    text: `Hi ${firstName},\n\nVerify your email: ${verificationUrl}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail(
  { to, firstName, resetCode, correlationId },
  dependencies,
) {
  return sendEmail(
    {
      to,
      kind: 'password-reset',
      correlationId,
      subject: 'Reset your HelloDeploy password',
      html: `
      <p>Hi ${firstName},</p>
      <p>You requested a password reset. Enter the code below on the HelloDeploy website:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${resetCode}</p>
      <p>This code expires in 1 hour and can only be used once.</p>
      <p>If you did not request a password reset, you can ignore this email.</p>
    `,
      text: `Hi ${firstName},\n\nYour password reset code: ${resetCode}\n\nThis code expires in 1 hour.`,
    },
    dependencies,
  );
}

export function buildProjectPausedEmail({ to, firstName, projectName, projectUrl }) {
  const safeFirstName = escapeEmailHtml(firstName);
  const safeProjectName = escapeEmailHtml(projectName);
  const safeProjectUrl = escapeEmailHtml(projectUrl);
  const safeSubjectName = String(projectName ?? '').replace(/[\r\n]+/g, ' ');
  return {
    to,
    subject: `Auto-deploy paused for ${safeSubjectName}`,
    html: `
      <p>Hi ${safeFirstName},</p>
      <p>HelloDeploy detected a high-risk file change in a push to <strong>${safeProjectName}</strong> and paused automatic deployment as a precaution.</p>
      <p>Review the change and deploy manually when you're ready: <a href="${safeProjectUrl}">${safeProjectUrl}</a></p>
    `,
    text: `Hi ${firstName},\n\nHelloDeploy paused automatic deployment for ${projectName} after detecting a high-risk file change. Review and deploy manually: ${projectUrl}`,
  };
}

export async function sendProjectPausedEmail(options) {
  return sendEmail({
    ...buildProjectPausedEmail(options),
    kind: 'project-paused',
    correlationId: options.correlationId,
  });
}

export async function sendPasswordChangedEmail({ to, firstName, correlationId }) {
  return sendEmail({
    to,
    kind: 'password-changed',
    correlationId,
    subject: 'Your HelloDeploy password has been changed',
    html: `
      <p>Hi ${firstName},</p>
      <p>Your HelloDeploy password was successfully changed.</p>
      <p>If you did not make this change, please contact support immediately.</p>
    `,
    text: `Hi ${firstName},\n\nYour HelloDeploy password was changed. If you did not do this, contact support immediately.`,
  });
}
