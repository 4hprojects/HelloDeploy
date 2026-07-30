import { DeploymentMode, DetectionStatus, ProjectStatus } from '@hellodeploy/contracts';

const RUNTIME_LABELS = Object.freeze({
  STATIC: 'Static website',
  REACT: 'React app',
  VUE: 'Vue app',
  NEXTJS: 'Next.js app',
  EXPRESS: 'Express app',
  NODEJS: 'Node.js app',
  UNKNOWN: 'App type not recognized',
});

const NOTIFICATION_LABELS = Object.freeze({
  ALL: 'All deployment outcomes',
  FAILURE_ONLY: 'Failed deployments only',
  NONE: 'No deployment emails',
});

function buildDetectionSummary(project, repository) {
  if (!repository) {
    return {
      label: 'Source not connected',
      description: 'Connect a repository before HelloDeploy can check the app.',
      actionLabel: 'Manage source',
    };
  }

  const hasCheck = Boolean(project.detection?.checkedAt);
  const currentCommit =
    Boolean(repository.lastCommitSha) &&
    project.detection?.checkedCommitSha?.toLowerCase() === repository.lastCommitSha.toLowerCase();
  const ready = project.detection?.status === DetectionStatus.READY && currentCommit;

  if (ready) {
    return {
      label: 'Ready',
      description: 'The app check matches the latest production-branch version.',
      actionLabel: 'Check again',
    };
  }

  if (!hasCheck) {
    return {
      label: 'Not checked',
      description: 'HelloDeploy has not checked how this app should run yet.',
      actionLabel: 'Check my app',
    };
  }

  if (!currentCommit) {
    return {
      label: 'Out of date',
      description: 'The repository changed after the last app check.',
      actionLabel: 'Check again',
    };
  }

  return {
    label: 'Needs attention',
    description: 'The latest app check found setup that needs review.',
    actionLabel: 'Check again',
  };
}

export function buildProjectSettingsView({ project, repository, domainCount, hasDeployHook }) {
  const deploymentModeLabels = {
    [DeploymentMode.MANUAL]: 'Manual deployments',
    [DeploymentMode.AUTOMATIC]: 'Automatic deployments',
    [DeploymentMode.APPROVAL_REQUIRED]: 'Approval required (legacy)',
  };
  const includedCount = project.buildFilters?.includedPaths?.length ?? 0;
  const ignoredCount = project.buildFilters?.ignoredPaths?.length ?? 0;

  return {
    readOnly: project.status === ProjectStatus.ARCHIVED,
    runtimeLabel: RUNTIME_LABELS[project.runtimeType] ?? 'Not checked',
    detection: buildDetectionSummary(project, repository),
    deploymentModeLabel: deploymentModeLabels[project.deploymentMode] ?? project.deploymentMode,
    notificationLabel:
      NOTIFICATION_LABELS[project.notificationPreference ?? 'ALL'] ??
      project.notificationPreference,
    buildSummary:
      project.buildConfiguration?.buildCommand ||
      project.buildConfiguration?.startCommand ||
      'HelloDeploy recommendation',
    deployRulesSummary:
      includedCount || ignoredCount
        ? `${includedCount} watched, ${ignoredCount} ignored`
        : 'Deploy every code change',
    domainSummary: domainCount === 1 ? '1 custom domain' : `${domainCount} custom domains`,
    deployHookSummary: hasDeployHook ? 'Configured' : 'Not configured',
    maintenanceSummary: project.maintenanceMode?.enabled ? 'Enabled' : 'Disabled',
  };
}
