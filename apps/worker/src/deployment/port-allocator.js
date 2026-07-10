import net from 'node:net';

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';

export const PORT_RANGE_START = env.PORT_RANGE_START;
export const PORT_RANGE_END = env.PORT_RANGE_END;
const MAX_CLAIM_ATTEMPTS = 5;

/**
 * True when the port can actually be bound on the loopback interface. The DB
 * scan only knows about HelloDeploy's own deployments — another host process
 * (or a container from a crashed deploy) may already hold the port.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function probePortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

const defaultDeps = { probePortFree };

const NON_TERMINAL_STATUSES = [
  DeploymentStatus.DEPLOYING,
  DeploymentStatus.HEALTHY,
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
];

async function findFreePort(deploymentId, skipPorts) {
  const active = await Deployment.find({
    _id: { $ne: deploymentId },
    status: { $in: NON_TERMINAL_STATUSES },
    containerPort: { $ne: null },
  })
    .select('containerPort')
    .lean();

  const usedPorts = new Set(active.map((d) => d.containerPort));

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port) && !skipPorts.has(port)) {
      return port;
    }
  }

  return null;
}

/**
 * Allocate a loopback port for a deployment's container and record it on the
 * deployment document.
 *
 * Claiming is scan → write → verify → probe: after writing the candidate port,
 * we re-check for another non-terminal deployment holding the same port, then
 * confirm the port is actually bindable at the OS level. On a concurrent
 * double-claim the deployment with the lower _id keeps the port (deterministic
 * tie-break so both sides can't retry forever) and the other retries with a
 * fresh scan; an OS-busy port is excluded from subsequent scans.
 *
 * @param {string|import('mongoose').Types.ObjectId} deploymentId
 * @returns {Promise<number>}
 * @throws if all ports in range are exhausted or claiming keeps colliding
 */
export async function allocatePort(deploymentId, deps = defaultDeps) {
  const skipPorts = new Set();

  for (let attempt = 1; attempt <= MAX_CLAIM_ATTEMPTS; attempt++) {
    const port = await findFreePort(deploymentId, skipPorts);
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
      if (await deps.probePortFree(port)) {
        return port;
      }
      logger.warn('PortAllocator: port busy at OS level, retrying', {
        deploymentId: String(deploymentId),
        port,
        attempt,
      });
      skipPorts.add(port);
      await Deployment.updateOne({ _id: deploymentId }, { $set: { containerPort: null } });
      continue;
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
