import { DeploymentMode, DetectionStatus, RuntimeType } from '@hellodeploy/contracts';

const SUPPORTED_RUNTIMES = new Set([
  RuntimeType.STATIC,
  RuntimeType.NODEJS,
  RuntimeType.EXPRESS,
  RuntimeType.REACT,
  RuntimeType.VUE,
  RuntimeType.NEXTJS,
]);

function finding(code, label, status, message) {
  return { code, label, status, message };
}

export function assessInitialApprovalReadiness({ project, repository }) {
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

  const deploymentModeReady = project.deploymentMode !== DeploymentMode.APPROVAL_REQUIRED;
  add(
    'deployment_mode',
    'Deployment mode',
    deploymentModeReady,
    `${project.deploymentMode === DeploymentMode.AUTOMATIC ? 'Automatic' : 'Manual'} deployment is selected.`,
    'Approval Required is not available yet. Choose Manual or Automatic deployment in Settings.',
  );

  for (const issue of project.detection?.issues ?? []) {
    findings.push(
      finding(
        `detection_${issue.level.toLowerCase()}`,
        issue.level === 'ERROR' ? 'Application check issue' : 'Application check recommendation',
        issue.level === 'ERROR' ? 'BLOCKING' : 'WARNING',
        issue.message,
      ),
    );
  }

  return {
    isReady: findings.every((item) => item.status !== 'BLOCKING'),
    findings,
    currentCommitSha: commitReady ? currentCommit : null,
  };
}

export function isApprovalSnapshotCurrent({ request, project, repository }) {
  const readiness = assessInitialApprovalReadiness({ project, repository });
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
