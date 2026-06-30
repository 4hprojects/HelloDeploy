import { Resend } from 'resend';
import { User } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';

let _resend = null;

function getResend() {
  if (!_resend && env.RESEND_API_KEY) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

async function sendEmail({ to, subject, html, text }) {
  const client = getResend();

  if (!client) {
    logger.info('[notification] DEV — email skipped (no RESEND_API_KEY)', {
      to,
      subject,
      preview: text?.slice(0, 120),
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
    logger.error('[notification] Failed to send deployment email', {
      to,
      subject,
      error: error.message,
    });
  }
}

/**
 * Notify the project owner when a deployment completes (HEALTHY or FAILED).
 * Failures are logged but never rethrown — notifications must never block the deployment pipeline.
 *
 * @param {{
 *   ownerId: string,
 *   projectName: string,
 *   projectSlug: string,
 *   sequenceNumber: number,
 *   status: 'HEALTHY' | 'FAILED',
 *   commitSha: string,
 *   failureCode?: string,
 *   failureSummary?: string,
 *   platformDomain: string,
 * }} opts
 */
export async function notifyDeploymentResult(opts) {
  const {
    ownerId,
    projectName,
    projectSlug,
    sequenceNumber,
    status,
    commitSha,
    failureCode,
    failureSummary,
    platformDomain,
  } = opts;

  try {
    const owner = await User.findById(ownerId).select('email name').lean();
    if (!owner) {
      return;
    }

    const dashboardUrl = `https://${platformDomain}/projects/${projectSlug}/deployments`;
    const isHealthy = status === 'HEALTHY';
    const shortSha = commitSha?.slice(0, 7) ?? '?';

    if (isHealthy) {
      await sendEmail({
        to: owner.email,
        subject: `Deployment #${sequenceNumber} succeeded – ${projectName}`,
        html: `
          <p>Hi ${owner.name},</p>
          <p>Deployment <strong>#${sequenceNumber}</strong> of <strong>${projectName}</strong> is now live.</p>
          <p>Commit: <code>${shortSha}</code></p>
          <p><a href="${dashboardUrl}">View deployments</a></p>
        `,
        text: `Deployment #${sequenceNumber} of ${projectName} succeeded (commit ${shortSha}).\n\nView: ${dashboardUrl}`,
      });
    } else {
      await sendEmail({
        to: owner.email,
        subject: `Deployment #${sequenceNumber} failed – ${projectName}`,
        html: `
          <p>Hi ${owner.name},</p>
          <p>Deployment <strong>#${sequenceNumber}</strong> of <strong>${projectName}</strong> failed.</p>
          <p>Commit: <code>${shortSha}</code></p>
          ${failureCode ? `<p>Reason: <code>${failureCode}</code></p>` : ''}
          ${failureSummary ? `<p>${failureSummary.slice(0, 200)}</p>` : ''}
          <p><a href="${dashboardUrl}">View deployment logs</a></p>
        `,
        text: `Deployment #${sequenceNumber} of ${projectName} failed (commit ${shortSha}).\n\n${failureSummary ?? ''}\n\nView: ${dashboardUrl}`,
      });
    }
  } catch (err) {
    logger.warn('[notification] Error sending deployment notification', {
      ownerId,
      projectSlug,
      sequenceNumber,
      error: err.message,
    });
  }
}
