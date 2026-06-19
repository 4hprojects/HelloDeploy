import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';

const PORT_RANGE_START = 10000;
const PORT_RANGE_END = 19999;

/**
 * Allocate the next available loopback port for a container.
 * Scans all non-terminal deployments with an assigned containerPort and
 * returns the lowest port in [PORT_RANGE_START, PORT_RANGE_END] not in use.
 *
 * @returns {Promise<number>}
 * @throws if all ports in range are exhausted
 */
export async function allocatePort() {
  const active = await Deployment.find({
    status: {
      $in: [
        DeploymentStatus.DEPLOYING,
        DeploymentStatus.HEALTHY,
        DeploymentStatus.QUEUED,
        DeploymentStatus.VALIDATING,
        DeploymentStatus.BUILDING,
      ],
    },
    containerPort: { $ne: null },
  })
    .select('containerPort')
    .lean();

  const usedPorts = new Set(active.map((d) => d.containerPort));

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error('No available ports in allocation range. Maximum concurrent deployments reached.');
}
