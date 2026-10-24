import { BUILDER_BUILD_STRATEGIES, DeploymentStatus } from '@hellodeploy/contracts';
import { Deployment } from '@hellodeploy/database';

import { updateStatus } from '../deployment/pipeline.js';

/**
 * Fail on-demand builds that a worker crash left mid-build. Their BullMQ job
 * is stalled and, on a retry, skips any deployment that is no longer QUEUED,
 * so without this they would stay BUILDING forever. Only builder strategies
 * are touched; legacy deployments keep their existing behavior. Call it only
 * when no other worker is connected, since a live worker may own the build.
 *
 * @returns {Promise<number>} how many deployments were failed
 */
export async function failInterruptedBuilderDeployments(deps = {}) {
  const findStuck =
    deps.findStuck ??
    (() =>
      Deployment.find({
        status: { $in: [DeploymentStatus.VALIDATING, DeploymentStatus.BUILDING] },
        'configurationSnapshot.buildStrategy': { $in: BUILDER_BUILD_STRATEGIES },
      })
        .select('_id')
        .lean());
  const markFailed = deps.markFailed ?? updateStatus;
  const stuck = await findStuck();
  for (const deployment of stuck) {
    await markFailed(deployment._id, DeploymentStatus.FAILED, {
      failureCode: 'WORKER_INTERRUPTED',
      failureSummary: 'The worker restarted while this deployment was building.',
      completedAt: new Date(),
    });
  }
  return stuck.length;
}
