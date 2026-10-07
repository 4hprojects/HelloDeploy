import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';
import { buildEmailContent } from '@hellodeploy/contracts';
import { queueEmailNotification } from './notification.service.js';

let resend = null;

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
  const content = buildEmailContent('email-verification', { firstName, verificationUrl });
  return sendEmail({
    to,
    kind: 'email-verification',
    correlationId,
    ...content,
  });
}

export async function sendPasswordResetEmail(
  { to, firstName, resetCode, correlationId },
  dependencies,
) {
  const content = buildEmailContent('password-reset', { firstName, resetCode });
  return sendEmail(
    {
      to,
      kind: 'password-reset',
      correlationId,
      ...content,
    },
    dependencies,
  );
}

export function buildProjectPausedEmail({ to, firstName, projectName, projectUrl }) {
  return { to, ...buildEmailContent('project-paused', { firstName, projectName, projectUrl }) };
}

export async function sendProjectPausedEmail(options) {
  if (options.userId) {
    return queueEmailNotification({
      userId: options.userId,
      kind: 'project-paused',
      payload: {
        firstName: options.firstName,
        projectName: options.projectName,
        projectUrl: options.projectUrl,
      },
      correlationId: options.correlationId,
      projectId: options.projectId,
    });
  }
  return sendEmail({
    ...buildProjectPausedEmail(options),
    kind: 'project-paused',
    correlationId: options.correlationId,
  });
}

export async function sendPasswordChangedEmail({ to, firstName, correlationId }) {
  const content = buildEmailContent('password-changed', { firstName });
  return sendEmail({
    to,
    kind: 'password-changed',
    correlationId,
    ...content,
  });
}
