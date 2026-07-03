import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';

const PORT_RANGE_START = 10000;
const PORT_RANGE_END = 19999;
const MAX_CLAIM_ATTEMPTS = 5;

const NON_TERMINAL_STATUSES = [
  DeploymentStatus.DEPLOYING,
  DeploymentStatus.HEALTHY,
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
];

async function findFreePort(deploymentId) {
  const active = await Deployment.find({
    _id: { $ne: deploymentId },
    status: { $in: NON_TERMINAL_STATUSES },
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

  return null;
}

/**
 * Allocate a loopback port for a deployment's container and record it on the
 * deployment document.
 *
 * Claiming is scan → write → verify: after writing the candidate port, we
 * re-check for another non-terminal deployment holding the same port. On a
 * concurrent double-claim the deployment with the lower _id keeps the port
 * (deterministic tie-break so both sides can't retry forever) and the other
 * retries with a fresh scan.
 *
 * @param {string|import('mongoose').Types.ObjectId} deploymentId
 * @returns {Promise<number>}
 * @throws if all ports in range are exhausted or claiming keeps colliding
 */
export async function allocatePort(deploymentId) {
  for (let attempt = 1; attempt <= MAX_CLAIM_ATTEMPTS; attempt++) {
    const port = await findFreePort(deploymentId);
    if (port === null) {
      throw new Error(
        'No available ports in allocation range. Maximum concurrent deployments reached.',
      );
    }

    await Deployment.updateOne({ _id: deploymentId }, { $set: { containerPort: port } });

    const rival = await Deployment.findOne({
      _id: { $ne: deploymentId },
      status: { $in: NON_TERMINAL_STATUSES },
      containerPort: port,
    })
      .select('_id')
      .lean();

    if (!rival || String(deploymentId) < String(rival._id)) {
      return port;
    }

    logger.warn('PortAllocator: concurrent claim collision, retrying', {
      deploymentId: String(deploymentId),
      port,
      attempt,
    });
    await Deployment.updateOne({ _id: deploymentId }, { $set: { containerPort: null } });
  }

  throw new Error('Could not claim a container port after repeated collisions.');
}
