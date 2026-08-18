import {
  ApprovalStatus,
  DeploymentMode,
  DeploymentStatus,
  DetectionStatus,
  ProjectRole,
  ProjectStatus,
} from '@hellodeploy/contracts';

const IN_FLIGHT_STATUSES = new Set([
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
]);

const canConfigure = (role) => role === ProjectRole.OWNER;
const canDeploy = (role) => [ProjectRole.OWNER, ProjectRole.MAINTAINER].includes(role);

function getAction(label, href, options = {}) {
  return {
    label,
    href,
    method: options.method ?? 'GET',
    external: options.external ?? false,
    pendingLabel: options.pendingLabel ?? null,
  };
}

function findingAction(slug, findingCode, role) {
  if (!canConfigure(role)) {
    return getAction('View project details', `/projects/${slug}/detection`);
  }
  if (['repository_access', 'repository_commit', 'production_branch'].includes(findingCode)) {
    return getAction('Check repository', `/projects/${slug}/repository`);
  }
  if (findingCode === 'deployment_mode' || findingCode === 'runtime_configuration') {
    return getAction('Review settings', `/projects/${slug}/settings`);
  }
  return getAction('Check my app', `/projects/${slug}/detection`);
}

export function buildApplicationUrl({ subdomain, deploymentDomain }) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain ?? '')) {
    return null;
  }
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(deploymentDomain ?? '')) {
    return null;
  }
  return `https://${subdomain}.${deploymentDomain}`;
}

export function buildProjectOverviewState({
  project,
  repository,
  deployments = [],
  activeDeployment,
  latestApproval,
  approvalReadiness,
  membershipRole,
  appUrl,
}) {
  const base = `/projects/${project.slug}`;
  const latestDeployment = deployments[0] ?? null;
  const inFlightDeployment =
    deployments.find((deployment) => IN_FLIGHT_STATUSES.has(deployment.status)) ?? null;
  const sourceConnected =
    Boolean(repository) &&
    repository.accessStatus === 'ACTIVE' &&
    (project.repositoryId?._id ?? project.repositoryId)?.toString() === repository._id?.toString();
  const appCheckCurrent =
    sourceConnected &&
    project.detection?.status === DetectionStatus.READY &&
    Boolean(repository.lastCommitSha) &&
    project.detection?.checkedCommitSha?.toLowerCase() === repository.lastCommitSha.toLowerCase();
  const approvalComplete =
    project.status === ProjectStatus.ACTIVE || latestApproval?.status === ApprovalStatus.APPROVED;
  const appLive = activeDeployment?.status === DeploymentStatus.HEALTHY;
  const newCommitAvailable =
    appLive &&
    sourceConnected &&
    Boolean(repository?.lastCommitSha) &&
    activeDeployment.commitSha !== repository.lastCommitSha;
  const attentionFindings = (approvalReadiness?.findings ?? []).filter(
    (finding) => finding.status !== 'PASS',
  );
  const blockingFinding = attentionFindings.find((finding) => finding.status === 'BLOCKING');

  const milestones = [
    {
      key: 'source',
      label: 'Source connected',
      done: sourceConnected,
      href: canConfigure(membershipRole) ? `${base}/repository` : null,
    },
    {
      key: 'check',
      label: 'App check passed',
      done: appCheckCurrent,
      href: `${base}/detection`,
    },
    {
      key: 'approval',
      label: 'Project approved',
      done: approvalComplete,
      href: canConfigure(membershipRole)
        ? latestApproval
          ? '#approval-feedback'
          : '#submit-review'
        : null,
    },
    {
      key: 'live',
      label: 'App is live',
      done: appLive,
      href: appLive ? appUrl : `${base}/deployments`,
    },
  ];

  const result = {
    phase: 'SETUP',
    tone: 'neutral',
    eyebrow: 'Next step',
    title: 'Finish setting up your app',
    description: 'HelloDeploy will guide you through the remaining setup.',
    primaryAction: null,
    milestones,
    attentionFindings,
    reviewFlag: project.reviewFlag?.active
      ? { reason: project.reviewFlag.reason, flaggedAt: project.reviewFlag.flaggedAt }
      : null,
    latestDeployment,
    inFlightDeployment,
    appLive,
    appUrl: appLive ? appUrl : null,
    showMilestones: !appLive,
    newCommitAvailable,
    canSubmit:
      canConfigure(membershipRole) &&
      project.status === ProjectStatus.DRAFT &&
      latestApproval?.status !== ApprovalStatus.PENDING &&
      Boolean(approvalReadiness?.isReady),
  };

  if ([ProjectStatus.SUSPENDED, ProjectStatus.ARCHIVED].includes(project.status)) {
    return {
      ...result,
      phase: 'SUSPENDED',
      tone: 'attention',
      eyebrow: project.status === ProjectStatus.ARCHIVED ? 'Archived' : 'Unavailable',
      title:
        project.status === ProjectStatus.ARCHIVED
          ? 'This project is archived'
          : 'This project is suspended',
      description:
        project.status === ProjectStatus.ARCHIVED
          ? 'The project is read-only and its app is not available.'
          : 'An administrator must reactivate this project before it can deploy.',
      primaryAction: null,
      appLive: false,
      appUrl: null,
      showMilestones: false,
      newCommitAvailable: false,
      canSubmit: false,
    };
  }

  if (project.status === ProjectStatus.DRAFT && !sourceConnected) {
    return {
      ...result,
      phase: repository ? 'NEEDS_ATTENTION' : 'SETUP',
      tone: repository ? 'attention' : 'neutral',
      title: repository ? 'Repository access needs attention' : 'Connect your app source',
      description: canConfigure(membershipRole)
        ? 'Connect the repository and production branch that HelloDeploy should deploy.'
        : 'The project owner needs to connect a repository before setup can continue.',
      primaryAction: canConfigure(membershipRole)
        ? getAction('Connect repository', `${base}/repository`)
        : null,
    };
  }

  if (project.status === ProjectStatus.DRAFT && !appCheckCurrent) {
    const neverChecked = !project.detection?.checkedAt;
    return {
      ...result,
      phase: neverChecked ? 'SETUP' : 'NEEDS_ATTENTION',
      tone: neverChecked ? 'neutral' : 'attention',
      title: neverChecked ? 'Check how your app should run' : 'Check your app again',
      description: neverChecked
        ? 'HelloDeploy will identify the recommended build and start settings.'
        : 'The repository changed or the last app check needs attention.',
      primaryAction: getAction(
        canConfigure(membershipRole)
          ? neverChecked
            ? 'Check my app'
            : 'Check again'
          : 'View app check',
        `${base}/detection`,
      ),
    };
  }

  if (project.deploymentMode === DeploymentMode.APPROVAL_REQUIRED) {
    return {
      ...result,
      phase: 'NEEDS_ATTENTION',
      tone: 'attention',
      title: 'Choose a supported deployment mode',
      description: 'Approval Required is not available yet. Choose Manual or Automatic deployment.',
      primaryAction: canConfigure(membershipRole)
        ? getAction('Review settings', `${base}/settings#deployment`)
        : null,
    };
  }

  if (latestApproval?.status === ApprovalStatus.PENDING) {
    return {
      ...result,
      phase: 'PENDING_REVIEW',
      tone: 'pending',
      eyebrow: 'Project review',
      title: 'Waiting for administrator review',
      description: 'Your setup was submitted successfully. No further action is needed right now.',
      primaryAction: canConfigure(membershipRole)
        ? getAction('View review details', '#approval-feedback')
        : null,
      canSubmit: false,
    };
  }

  if (
    [ApprovalStatus.CHANGES_REQUESTED, ApprovalStatus.REJECTED].includes(latestApproval?.status)
  ) {
    return {
      ...result,
      phase: 'NEEDS_ATTENTION',
      tone: 'attention',
      eyebrow: 'Changes requested',
      title: 'Review the administrator’s feedback',
      description: 'Complete the requested updates, check the app again, and resubmit it.',
      primaryAction: canConfigure(membershipRole)
        ? getAction('View requested changes', '#approval-feedback')
        : null,
    };
  }

  if (project.status === ProjectStatus.DRAFT) {
    if (!approvalReadiness?.isReady) {
      return {
        ...result,
        phase: 'NEEDS_ATTENTION',
        tone: 'attention',
        title: 'Complete the required setup',
        description:
          blockingFinding?.message ?? 'Review the remaining setup items before submission.',
        primaryAction: findingAction(project.slug, blockingFinding?.code, membershipRole),
      };
    }
    return {
      ...result,
      phase: 'SETUP',
      tone: 'ready',
      eyebrow: 'Ready for review',
      title: 'Your app is ready to submit',
      description: 'Add a short description so an administrator can review the project.',
      primaryAction: canConfigure(membershipRole)
        ? getAction('Submit for review', '#submit-review')
        : null,
    };
  }

  if (inFlightDeployment) {
    return {
      ...result,
      phase: 'DEPLOYING',
      tone: 'pending',
      eyebrow: 'Deployment in progress',
      title: 'HelloDeploy is publishing your app',
      description: `Deployment #${inFlightDeployment.sequenceNumber} is ${inFlightDeployment.status.toLowerCase()}.`,
      primaryAction: getAction('View progress', `${base}/deployments/${inFlightDeployment._id}`),
      canSubmit: false,
    };
  }

  if (appLive) {
    const failedUpdate =
      latestDeployment?.status === DeploymentStatus.FAILED &&
      latestDeployment._id?.toString() !== activeDeployment._id?.toString();
    const sourceNeedsAttention = !sourceConnected;
    return {
      ...result,
      phase: 'LIVE',
      tone: failedUpdate || sourceNeedsAttention || newCommitAvailable ? 'attention' : 'live',
      eyebrow: failedUpdate
        ? 'App live, update failed'
        : sourceNeedsAttention
          ? 'App live, source needs attention'
          : newCommitAvailable
            ? 'Update available'
            : 'Live',
      title: failedUpdate
        ? 'Your app is live on the previous version'
        : sourceNeedsAttention
          ? 'Your app is live, but source access needs attention'
          : newCommitAvailable
            ? 'Your app is live with an update ready'
            : 'Your app is live',
      description: failedUpdate
        ? `Deployment #${latestDeployment.sequenceNumber} failed, but the previous healthy version is still serving visitors.`
        : sourceNeedsAttention
          ? 'The current version is still serving visitors. Reconnect the repository before publishing an update.'
          : newCommitAvailable
            ? 'New code is available from the production branch.'
            : 'The latest healthy deployment is serving visitors.',
      primaryAction: failedUpdate
        ? getAction('View failed update', `${base}/deployments/${latestDeployment._id}`)
        : sourceNeedsAttention && canConfigure(membershipRole)
          ? getAction('Check repository', `${base}/repository`)
          : newCommitAvailable && canDeploy(membershipRole)
            ? getAction('Deploy update', `${base}/deployments`, {
                method: 'POST',
                pendingLabel: 'Deploying...',
              })
            : appUrl
              ? getAction('Open app', appUrl, { external: true })
              : getAction('View deployment', `${base}/deployments/${activeDeployment._id}`),
      showMilestones: false,
      canSubmit: false,
    };
  }

  if (!sourceConnected) {
    return {
      ...result,
      phase: 'NEEDS_ATTENTION',
      tone: 'attention',
      title: 'Repository access needs attention',
      description: canConfigure(membershipRole)
        ? 'Reconnect the source repository before publishing another version.'
        : 'The project owner needs to reconnect the source repository.',
      primaryAction: canConfigure(membershipRole)
        ? getAction('Check repository', `${base}/repository`)
        : null,
      canSubmit: false,
    };
  }

  if (latestDeployment?.status === DeploymentStatus.FAILED) {
    return {
      ...result,
      phase: 'NEEDS_ATTENTION',
      tone: 'attention',
      eyebrow: 'Deployment failed',
      title: 'Your app could not be published',
      description:
        latestDeployment.failureSummary ??
        'Open the deployment details to see what needs to be fixed.',
      primaryAction: canDeploy(membershipRole)
        ? getAction('Retry deployment', `${base}/deployments/${latestDeployment._id}/retry`, {
            method: 'POST',
            pendingLabel: 'Retrying...',
          })
        : getAction('View deployment', `${base}/deployments/${latestDeployment._id}`),
      canSubmit: false,
    };
  }

  if (!appCheckCurrent) {
    return {
      ...result,
      phase: 'NEEDS_ATTENTION',
      tone: 'attention',
      title: 'Check the current version before deploying',
      description:
        'The production branch changed after the last successful app check. Check it again before publishing.',
      primaryAction: getAction(
        canConfigure(membershipRole) ? 'Check again' : 'View app check',
        `${base}/detection`,
      ),
      canSubmit: false,
    };
  }

  return {
    ...result,
    phase: 'READY_TO_DEPLOY',
    tone: 'ready',
    eyebrow: 'Approved',
    title: 'Your app is ready to deploy',
    description: canDeploy(membershipRole)
      ? 'Publish the current production branch when you are ready.'
      : 'An owner or maintainer can now publish the app.',
    primaryAction: canDeploy(membershipRole)
      ? getAction('Deploy my app', `${base}/deployments`, {
          method: 'POST',
          pendingLabel: 'Deploying...',
        })
      : getAction('View deployments', `${base}/deployments`),
    canSubmit: false,
  };
}
