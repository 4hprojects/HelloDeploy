import { Deployment, EnvironmentSecret, Repository } from '@hellodeploy/database';

import { env } from '../config/env.js';
import { assessInitialApprovalReadiness } from './approval-readiness.service.js';
import { getDeployments } from './deployment.service.js';
import { buildApplicationUrl, buildProjectOverviewState } from './project-overview.service.js';
import { getLatestApprovalRequest } from './project.service.js';

export async function loadProjectOverviewState(project, membershipRole) {
  const [repository, deployments, latestApproval, activeDeployment, secretRecords] =
    await Promise.all([
      project.repositoryId ? Repository.findById(project.repositoryId).lean() : null,
      getDeployments(project._id, 5),
      getLatestApprovalRequest(project._id),
      project.activeDeploymentId ? Deployment.findById(project.activeDeploymentId).lean() : null,
      EnvironmentSecret.find({ projectId: project._id }).select('name').lean(),
    ]);

  const approvalReadiness = assessInitialApprovalReadiness({
    project,
    repository,
    configuredEnvironmentVariables: secretRecords.map(({ name }) => name),
  });
  const appUrl = buildApplicationUrl({
    subdomain: project.platformSubdomain ?? project.slug,
    deploymentDomain: env.DEPLOYMENT_DOMAIN,
  });
  const overviewState = buildProjectOverviewState({
    project,
    repository,
    deployments,
    activeDeployment,
    latestApproval,
    approvalReadiness,
    membershipRole,
    appUrl,
  });

  return {
    overviewState,
    repository,
    deployments,
    activeDeployment,
    latestApproval,
    approvalReadiness,
    appUrl,
  };
}
