import { escapeEmailHtml, renderEmail } from './email-layout.js';

export { escapeEmailHtml };

export function sanitizeEmailSubject(value) {
  // Header line breaks must never be derived from user-controlled names.
  // eslint-disable-next-line no-control-regex
  const controlCharacters = /[\u0000-\u001f\u007f]+/g;
  return String(value ?? '')
    .replace(controlCharacters, ' ')
    .trim();
}

/**
 * Build the subject, HTML, and plain-text body for one email kind.
 * `platformUrl` (e.g. https://hellodeploy.online) adds the hosted logo; without
 * it the header shows the wordmark only.
 */
export function buildEmailContent(kind, payload, { platformUrl } = {}) {
  const greeting = `Hi ${payload.firstName},`;
  const ignoreNote = 'Not expecting this email? You can safely ignore it.';

  if (kind === 'email-verification') {
    return {
      subject: 'Verify your HelloDeploy email address',
      ...renderEmail({
        platformUrl,
        preheader: 'Confirm your email address to finish setting up your account.',
        heading: 'Verify your email address',
        greeting,
        paragraphs: [
          'Thanks for creating a HelloDeploy account. Confirm this is your email address to finish setting it up.',
        ],
        action: { label: 'Verify email address', url: payload.verificationUrl },
        notes: ['This link expires in 24 hours and can only be used once.'],
        footerNotes: ["Didn't create an account? You can safely ignore this email."],
      }),
    };
  }
  if (kind === 'password-reset') {
    return {
      subject: 'Reset your HelloDeploy password',
      ...renderEmail({
        platformUrl,
        preheader: 'Your password reset code is inside. It expires in 1 hour.',
        heading: 'Reset your password',
        greeting,
        paragraphs: ['Enter this code on the HelloDeploy website to choose a new password:'],
        code: payload.resetCode,
        notes: ['This code expires in 1 hour and can only be used once.'],
        footerNotes: [
          "Didn't ask to reset your password? You can safely ignore this email; your password stays the same.",
        ],
      }),
    };
  }
  if (kind === 'password-changed') {
    return {
      subject: 'Your HelloDeploy password has been changed',
      ...renderEmail({
        platformUrl,
        preheader: 'Your HelloDeploy password was just changed.',
        heading: 'Your password was changed',
        greeting,
        paragraphs: ['The password for your HelloDeploy account was changed successfully.'],
        notes: [
          [
            { strong: "Didn't do this?" },
            ' Contact support immediately so we can secure your account.',
          ],
        ],
      }),
    };
  }
  if (kind === 'account-closure-requested') {
    return {
      subject: 'We received your request to close your HelloDeploy account',
      ...renderEmail({
        platformUrl,
        preheader: 'An administrator will review and complete your account closure.',
        heading: 'Account closure requested',
        greeting,
        paragraphs: [
          'We received your request to close your HelloDeploy account. An administrator will review it and delete the account, your projects, and their deployments.',
          'Until then you can still sign in. Download anything you want to keep from your repositories and databases, because deletion cannot be undone.',
        ],
        notes: [
          [
            { strong: 'Changed your mind or did not ask for this?' },
            ` Email ${payload.contactEmail} before the account is deleted.`,
          ],
        ],
      }),
    };
  }
  if (kind === 'account-suspended') {
    return {
      subject: 'Your HelloDeploy account has been suspended',
      ...renderEmail({
        platformUrl,
        preheader: 'Your HelloDeploy account was suspended. You can appeal by email.',
        heading: 'Your account was suspended',
        greeting,
        paragraphs: [
          'An administrator suspended your HelloDeploy account, and you have been signed out.',
          `To appeal, email ${payload.contactEmail} with your account email and any information that helps us review the decision.`,
        ],
        details: payload.reason ? [['Reason', payload.reason]] : [],
      }),
    };
  }
  if (kind === 'project-paused') {
    return {
      subject: `Auto-deploy paused for ${sanitizeEmailSubject(payload.projectName)}`,
      ...renderEmail({
        platformUrl,
        preheader: `A high-risk change paused automatic deployment for ${payload.projectName}.`,
        heading: 'Automatic deployment paused',
        greeting,
        paragraphs: [
          [
            'HelloDeploy found a high-risk file change in a push to ',
            { strong: payload.projectName },
            ' and paused automatic deployment as a precaution.',
          ],
          "Review the change, then deploy manually when you're ready.",
        ],
        details: [['Project', payload.projectName]],
        action: { label: 'Review project', url: payload.projectUrl },
      }),
    };
  }
  if (kind === 'approval-requested') {
    return {
      subject: `Review needed: ${sanitizeEmailSubject(payload.projectName)}`,
      ...renderEmail({
        platformUrl,
        preheader: `${payload.projectName} is waiting for project review.`,
        heading: 'A project needs review',
        greeting,
        paragraphs: [[{ strong: payload.projectName }, ' is waiting for project review.']],
        details: [['Project', payload.projectName]],
        action: { label: 'Open approval queue', url: payload.reviewUrl },
        notes: [
          `If automatic approval is on and nobody reviews it within ${payload.provisionalAfterMinutes} minutes, it goes live provisionally with reduced limits until an admin confirms or suspends it.`,
        ],
      }),
    };
  }
  if (kind === 'deployment-result') {
    return buildDeploymentResult(payload, { platformUrl, greeting });
  }
  if (kind === 'project-invite') {
    const roleLabel = roleLabelFor(payload.role);
    return {
      subject: `${sanitizeEmailSubject(payload.inviterName)} invited you to ${sanitizeEmailSubject(payload.projectName)} on HelloDeploy`,
      ...renderEmail({
        platformUrl,
        preheader: `Join ${payload.projectName} on HelloDeploy as a ${roleLabel}.`,
        heading: `You're invited to ${payload.projectName}`,
        greeting: 'Hi,',
        paragraphs: [
          [
            { strong: payload.inviterName },
            ' invited you to help run ',
            { strong: payload.projectName },
            " on HelloDeploy. Create your account with this email address and you'll join the project as soon as it's verified.",
          ],
        ],
        details: [
          ['Project', payload.projectName],
          ['Your role', roleLabel],
          ['Invited by', payload.inviterName],
          ['Your email', payload.email],
        ],
        action: { label: 'Accept invitation', url: payload.signupUrl },
        notes: [`This invitation expires in ${payload.expiresInDays} days.`],
        footerNotes: [ignoreNote],
      }),
    };
  }
  if (kind === 'project-member-added') {
    const roleLabel = roleLabelFor(payload.role);
    return {
      subject: `You were added to ${sanitizeEmailSubject(payload.projectName)} on HelloDeploy`,
      ...renderEmail({
        platformUrl,
        preheader: `${payload.inviterName} added you to ${payload.projectName} as a ${roleLabel}.`,
        heading: `You've joined ${payload.projectName}`,
        greeting,
        paragraphs: [
          [{ strong: payload.inviterName }, ' added you to ', { strong: payload.projectName }, '.'],
        ],
        details: [
          ['Project', payload.projectName],
          ['Your role', roleLabel],
          ['Added by', payload.inviterName],
        ],
        action: { label: 'Open project', url: payload.projectUrl },
      }),
    };
  }
  throw new Error(`Unsupported email kind: ${kind}`);
}

function buildDeploymentResult(payload, { platformUrl, greeting }) {
  const isSuccess = payload.status === 'HEALTHY';
  const outcome = isSuccess ? 'succeeded' : 'failed';
  const shortSha = payload.commitSha?.slice(0, 7) ?? '?';
  const failureLines = [payload.failureMessage, payload.failureAction].filter(Boolean);
  const technical = payload.failureCode
    ? [
        `Technical details: ${payload.failureCode}${payload.failureSummary ? ` — ${String(payload.failureSummary).slice(0, 200)}` : ''}`,
      ]
    : [];
  return {
    subject: `Deployment #${payload.sequenceNumber} ${outcome} – ${sanitizeEmailSubject(payload.projectName)}`,
    ...renderEmail({
      platformUrl,
      preheader: isSuccess
        ? `${payload.projectName} is live with commit ${shortSha}.`
        : `Deployment #${payload.sequenceNumber} of ${payload.projectName} failed. Open the logs to see what went wrong.`,
      status: isSuccess ? { label: 'Live', tone: 'success' } : { label: 'Failed', tone: 'danger' },
      heading: isSuccess
        ? `Deployment #${payload.sequenceNumber} is live`
        : `Deployment #${payload.sequenceNumber} failed`,
      greeting,
      paragraphs: [
        [
          `Deployment #${payload.sequenceNumber} of `,
          { strong: payload.projectName },
          ` ${outcome} (commit ${shortSha}).`,
        ],
        ...failureLines.map((line, index) => (index === 0 ? [{ strong: line }] : line)),
      ],
      action: {
        label: isSuccess ? 'View deployments' : 'View deployment logs',
        url: payload.dashboardUrl,
      },
      notes: technical,
    }),
  };
}

function roleLabelFor(role) {
  return role === 'VIEWER' ? 'Viewer (read-only)' : 'Maintainer (can deploy)';
}
