import { ConfigurationError } from '@hellodeploy/contracts';
import { PlatformSetting } from '@hellodeploy/database';

// A worker without Nginx routing that shares production's database and queue
// takes real deployments and marks them live with no route (helloeventhub,
// 2026-10-14). Production records itself in the database so any such worker
// can recognize where it is and refuse to start.
const DEPLOYMENT_ENVIRONMENT_KEY = 'deployment-environment';
const PRODUCTION = 'production';

/**
 * @param {{ isProduction: boolean, nginxEnabled: boolean, marker: unknown }} context
 */
export function assertWorkerMayUseDatabase({ isProduction, nginxEnabled, marker }) {
  if (!isProduction && !nginxEnabled && marker === PRODUCTION) {
    throw new ConfigurationError(
      'This database belongs to a production HelloDeploy. A worker without Nginx routing must not process its deployments. Point MONGODB_URI and REDIS_* at a development database (see docs/ENVIRONMENT.md).',
    );
  }
}

/** Record or check the database's environment. Call once, right after connecting. */
export async function guardWorkerDatabase({ isProduction, nginxEnabled }) {
  if (isProduction) {
    await PlatformSetting.updateOne(
      { key: DEPLOYMENT_ENVIRONMENT_KEY },
      { $set: { value: PRODUCTION } },
      { upsert: true },
    );
    return;
  }
  const setting = await PlatformSetting.findOne({ key: DEPLOYMENT_ENVIRONMENT_KEY }).lean();
  assertWorkerMayUseDatabase({ isProduction, nginxEnabled, marker: setting?.value });
}
