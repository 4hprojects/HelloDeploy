import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';

let resend = null;

function getResendClient() {
  if (!resend && env.RESEND_API_KEY) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Send an email. In development without RESEND_API_KEY, logs to stdout instead.
 * @returns {Promise<void>}
 */
async function sendEmail({ to, subject, html, text }) {
  const client = getResendClient();

  if (!client) {
    logger.info('[email] DEV MODE — email not sent (no RESEND_API_KEY)', {
      to,
      subject,
      preview: text?.slice(0, 200),
    });
    return;
  }

  const { error } = await client.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    logger.error('[email] Failed to send email', { to, subject, error: error.message });
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

export async function sendVerificationEmail({ to, firstName, verificationUrl }) {
  await sendEmail({
    to,
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

export async function sendPasswordResetEmail({ to, firstName, resetCode }) {
  await sendEmail({
    to,
    subject: 'Reset your HelloDeploy password',
    html: `
      <p>Hi ${firstName},</p>
      <p>You requested a password reset. Enter the code below on the HelloDeploy website:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${resetCode}</p>
      <p>This code expires in 1 hour and can only be used once.</p>
      <p>If you did not request a password reset, you can ignore this email.</p>
    `,
    text: `Hi ${firstName},\n\nYour password reset code: ${resetCode}\n\nThis code expires in 1 hour.`,
  });
}

export async function sendPasswordChangedEmail({ to, firstName }) {
  await sendEmail({
    to,
    subject: 'Your HelloDeploy password has been changed',
    html: `
      <p>Hi ${firstName},</p>
      <p>Your HelloDeploy password was successfully changed.</p>
      <p>If you did not make this change, please contact support immediately.</p>
    `,
    text: `Hi ${firstName},\n\nYour HelloDeploy password was changed. If you did not do this, contact support immediately.`,
  });
}
