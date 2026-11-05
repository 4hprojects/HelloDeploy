import { ContainerRole } from '@hellodeploy/contracts';

const BUILD_CONTAINER = /^buildx_buildkit_/;

/**
 * Decide what each container is, from trusted records rather than names:
 * a container is a project's ACTIVE release only if it is the
 * `activeContainerId` of that project's `activeDeploymentId`. Candidates and
 * retained releases are listed but never counted as extra applications.
 *
 * @param {Array} containers parsed `docker inspect` rows
 * @param {{ projects: Array, deployments: Array }} records lean Mongo documents
 */
export function classifyContainers(containers, { projects, deployments }) {
  const projectsById = new Map(projects.map((project) => [String(project._id), project]));
  const activeContainerIds = new Set();
  const candidateContainerIds = new Set();
  const deploymentsById = new Map();
  for (const deployment of deployments) {
    deploymentsById.set(String(deployment._id), deployment);
    const project = projectsById.get(String(deployment.projectId));
    if (
      deployment.activeContainerId &&
      project &&
      String(project.activeDeploymentId) === String(deployment._id)
    ) {
      activeContainerIds.add(deployment.activeContainerId);
    }
    if (
      deployment.candidateContainerId &&
      deployment.candidateContainerId !== deployment.activeContainerId
    ) {
      candidateContainerIds.add(deployment.candidateContainerId);
    }
  }

  return containers.map((container) => {
    let role;
    if (!container.managed) {
      role = BUILD_CONTAINER.test(container.name) ? ContainerRole.BUILD : ContainerRole.UNMANAGED;
    } else if (activeContainerIds.has(container.id)) {
      role = ContainerRole.ACTIVE;
    } else if (candidateContainerIds.has(container.id)) {
      role = ContainerRole.CANDIDATE;
    } else if (container.deploymentId && deploymentsById.has(container.deploymentId)) {
      role = ContainerRole.RETAINED;
    } else {
      role = ContainerRole.ORPHANED;
    }
    return { ...container, role };
  });
}
