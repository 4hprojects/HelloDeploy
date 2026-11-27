import {
  AccountTier,
  DeploymentMode,
  DetectionStatus,
  PLATFORM_MANAGED_ENV_NAMES,
  RuntimeType,
} from '@hellodeploy/contracts';

const SUPPORTED_RUNTIMES = new Set([
  RuntimeType.STATIC,
  RuntimeType.NODEJS,
  RuntimeType.EXPRESS,
  RuntimeType.REACT,
  RuntimeType.VUE,
  RuntimeType.NEXTJS,
]);

// No server process runs at runtime, so the blast radius is static files behind nginx.
const LOW_RISK_RUNTIMES = new Set([RuntimeType.STATIC, RuntimeType.REACT, RuntimeType.VUE]);

// Static sites are the usual phishing vehicle, so an untrusted owner's site is
// approved on submit only when its repository was plainly worked on. GitHub sets
// both creation dates; the commit count can be scripted and is only one signal.
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REPOSITORY_AGE_MS = 7 * DAY_MS;
const MIN_GITHUB_ACCOUNT_AGE_MS = 30 * DAY_MS;
const MIN_BRANCH_COMMITS = 5;

export function isLowRiskRuntime(runtimeType) {
  return LOW_RISK_RUNTIMES.has(runtimeType);
}

export const REPOSITORY_HISTORY_BLOCKERS = Object.freeze([
  'repository_history',
  'repository_history_unavailable',
]);

const DETECTION_ISSUE_FINDINGS = Object.freeze({
  ERROR: { label: 'Application check issue', status: 'BLOCKING' },
  WARNING: { label: 'Application check recommendation', status: 'WARNING' },
  // Informational only: never blocks submission or automatic approval.
  INFO: { label: 'Application check note', status: 'INFO' },
});

function finding(code, label, status, message) {
  return { code, label, status, message };
}

export function assessInitialApprovalReadiness({
  project,
  repository,
  configuredEnvironmentVariables = [],
}) {
  const findings = [];
  const add = (code, label, ready, readyMessage, blockingMessage) => {
    findings.push(
      finding(code, label, ready ? 'PASS' : 'BLOCKING', ready ? readyMessage : blockingMessage),
    );
  };

  const projectRepositoryId = project.repositoryId?._id ?? project.repositoryId;
  const repositoryReady =
    Boolean(repository) &&
    repository.accessStatus === 'ACTIVE' &&
    projectRepositoryId?.toString() === repository._id?.toString();
  add(
    'repository_access',
    'Repository access',
    repositoryReady,
    'HelloDeploy can access the source repository.',
    'Connect a repository that HelloDeploy can access.',
  );

  const branchReady = Boolean(project.productionBranch?.trim());
  add(
    'production_branch',
    'Production branch',
    branchReady,
    `Code will be checked from ${project.productionBranch || 'the production branch'}.`,
    'Choose the branch that should be deployed to production.',
  );

  const currentCommit = repository?.lastCommitSha;
  const commitReady = /^[a-f0-9]{40}$/i.test(currentCommit ?? '');
  add(
    'repository_commit',
    'Repository version',
    commitReady,
    `The current code version is ${currentCommit?.slice(0, 7)}.`,
    'HelloDeploy could not identify the current code version. Reconnect the repository or try again.',
  );

  const runtimeReady = SUPPORTED_RUNTIMES.has(project.runtimeType);
  add(
    'supported_runtime',
    'Application type',
    runtimeReady,
    `${project.runtimeType} is supported by HelloDeploy.`,
    'Run Check my app so HelloDeploy can identify a supported application type.',
  );

  const detectionReady = project.detection?.status === DetectionStatus.READY;
  add(
    'successful_detection',
    'Application check',
    detectionReady,
    'The latest application check passed.',
    'Open Detection and complete Check my app before submitting.',
  );

  const detectionCurrent =
    commitReady &&
    detectionReady &&
    project.detection?.checkedCommitSha?.toLowerCase() === currentCommit?.toLowerCase();
  add(
    'current_detection',
    'Checked code version',
    detectionCurrent,
    'The application check matches the current repository version.',
    'The repository changed after the last application check. Run Check again.',
  );

  const config = project.buildConfiguration ?? {};
  let runtimeConfigurationReady = runtimeReady;
  if ([RuntimeType.NODEJS, RuntimeType.EXPRESS].includes(project.runtimeType)) {
    runtimeConfigurationReady =
      Boolean(config.startCommand?.trim()) &&
      Number.isInteger(config.applicationPort) &&
      config.applicationPort >= 1 &&
      config.applicationPort <= 65535;
  } else if (
    [RuntimeType.REACT, RuntimeType.VUE, RuntimeType.STATIC].includes(project.runtimeType)
  ) {
    runtimeConfigurationReady =
      Boolean(config.outputDirectory?.trim()) &&
      (project.runtimeType === RuntimeType.STATIC || Boolean(config.buildCommand?.trim()));
  } else if (project.runtimeType === RuntimeType.NEXTJS) {
    runtimeConfigurationReady =
      Boolean(config.buildCommand?.trim()) && Boolean(config.startCommand?.trim());
  }
  runtimeConfigurationReady =
    runtimeConfigurationReady &&
    Boolean(config.healthCheckPath?.startsWith('/')) &&
    !config.healthCheckPath?.includes('://');
  add(
    'runtime_configuration',
    'Build and start settings',
    runtimeConfigurationReady,
    'The required build and runtime settings are present.',
    'Review the recommended values in Advanced build settings and fix the highlighted fields.',
  );

  const configuredNames = new Set(configuredEnvironmentVariables);
  // Detections stored before PORT became platform-managed still list it.
  const requiredNames = (project.detection?.requiredEnvironmentVariables ?? []).filter(
    (name) => !PLATFORM_MANAGED_ENV_NAMES.includes(name),
  );
  if (requiredNames.length > 0) {
    const missingNames = requiredNames.filter((name) => !configuredNames.has(name));
    add(
      'required_environment',
      'Required environment variables',
      missingNames.length === 0,
      `All ${requiredNames.length} detected variable names are set.`,
      `Set the missing variables: ${missingNames.join(', ')}.`,
    );
  }

  const deploymentModeReady = project.deploymentMode !== DeploymentMode.APPROVAL_REQUIRED;
  add(
    'deployment_mode',
    'Deployment mode',
    deploymentModeReady,
    `${project.deploymentMode === DeploymentMode.AUTOMATIC ? 'Automatic' : 'Manual'} deployment is selected.`,
    'Approval Required is not available yet. Choose Manual or Automatic deployment in Settings.',
  );

  for (const issue of project.detection?.issues ?? []) {
    const { label, status } =
      DETECTION_ISSUE_FINDINGS[issue.level] ?? DETECTION_ISSUE_FINDINGS.ERROR;
    findings.push(finding(`detection_${issue.level.toLowerCase()}`, label, status, issue.message));
  }

  return {
    isReady: findings.every((item) => item.status !== 'BLOCKING'),
    findings,
    currentCommitSha: commitReady ? currentCommit : null,
  };
}

/**
 * Decide whether a ready submission can skip the admin queue.
 *
 * Returns reason codes either way so the audit trail shows why a project was or
 * was not approved automatically.
 */
export function assessAutoApprovalEligibility({
  project,
  readiness,
  owner,
  hasPriorApproval,
  repositoryHistory = null,
  now = new Date(),
}) {
  const blockers = [];
  if (!readiness.isReady) {
    blockers.push('not_ready');
  }
  if (readiness.findings.some((item) => item.status === 'WARNING')) {
    blockers.push('detection_warnings');
  }

  const trustReasons = [];
  if (owner?.accountTier === AccountTier.PREMIUM) {
    trustReasons.push('premium_account');
  }
  if (owner?.isTrustedForAutoApproval) {
    trustReasons.push('trusted_owner');
  }
  if (hasPriorApproval) {
    trustReasons.push('prior_approval');
  }

  const isLowRiskRuntime = LOW_RISK_RUNTIMES.has(project.runtimeType);
  const isUntrusted = trustReasons.length === 0;
  if (!isLowRiskRuntime && isUntrusted) {
    blockers.push('server_runtime_untrusted_owner');
  }
  if (isLowRiskRuntime && isUntrusted) {
    if (!repositoryHistory) {
      blockers.push('repository_history_unavailable');
    } else if (!isEstablishedRepository(repositoryHistory, now)) {
      blockers.push('repository_history');
    }
  }

  if (blockers.length > 0) {
    return { isEligible: false, reasons: blockers };
  }
  return {
    isEligible: true,
    reasons: [
      ...(isLowRiskRuntime ? ['low_risk_runtime'] : []),
      ...(isLowRiskRuntime && isUntrusted ? ['established_repository'] : []),
      ...trustReasons,
    ],
  };
}

function isEstablishedRepository(history, now) {
  const isOlderThan = (date, minimumMs) =>
    date instanceof Date && now.getTime() - date.getTime() >= minimumMs;
  return (
    isOlderThan(history.repoCreatedAt, MIN_REPOSITORY_AGE_MS) &&
    isOlderThan(history.ownerCreatedAt, MIN_GITHUB_ACCOUNT_AGE_MS) &&
    !history.isFork &&
    history.commitCount >= MIN_BRANCH_COMMITS
  );
}

export function isApprovalSnapshotCurrent({
  request,
  project,
  repository,
  configuredEnvironmentVariables = [],
}) {
  const readiness = assessInitialApprovalReadiness({
    project,
    repository,
    configuredEnvironmentVariables,
  });
  const hasSnapshot =
    Number.isInteger(request.snapshotConfigurationVersion) && Boolean(request.snapshotCommitSha);
  const configurationMatches =
    hasSnapshot && request.snapshotConfigurationVersion === project.configurationVersion;
  const commitMatches =
    hasSnapshot &&
    request.snapshotCommitSha.toLowerCase() === readiness.currentCommitSha?.toLowerCase();

  return {
    isCurrent: hasSnapshot && configurationMatches && commitMatches && readiness.isReady,
    hasSnapshot,
    configurationMatches,
    commitMatches,
    readiness,
  };
}
