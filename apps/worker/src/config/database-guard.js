import {
  ConfigurationError,
  DEPLOYMENT_ENVIRONMENT_KEY,
  LEGACY_PRODUCTION_ENVIRONMENT,
  createNonproductionEnvironmentMarker,
  isNonproductionEnvironmentMarker,
} from '@hellodeploy/contracts';
import { PlatformSetting } from '@hellodeploy/database';

// A worker without Nginx routing that shares production's database and queue
// takes real deployments and marks them live with no route (helloeventhub,
// 2026-10-14). Production records itself in the database so any such worker
// can recognize where it is and refuse to start.
/**
 * @param {{ isProduction: boolean, marker: unknown,
 *   nonproductionEnvironmentId?: string|null }} context
 */
export function assertWorkerMayUseDatabase({
  isProduction,
  marker,
  nonproductionEnvironmentId = null,
}) {
  if (nonproductionEnvironmentId) {
    if (
      !isNonproductionEnvironmentMarker(marker) ||
      marker.environmentId !== nonproductionEnvironmentId
    ) {
      throw new ConfigurationError(
        'This database does not match HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID. Refusing to start the deployment worker.',
      );
    }
    return;
  }

  if (isProduction) {
    if (marker !== LEGACY_PRODUCTION_ENVIRONMENT) {
      throw new ConfigurationError(
        'This database is not marked for this production HelloDeploy. Refusing to start the deployment worker.',
      );
    }
    return;
  }

  if (marker !== undefined && marker !== null) {
    throw new ConfigurationError(
      'This database is registered to another HelloDeploy environment. Configure the matching nonproduction environment id or use a development database.',
    );
  }
}

/** Record or check the database's environment. Call once, right after connecting. */
export async function guardWorkerDatabase(
  { isProduction, nonproductionEnvironmentId = null },
  settings = PlatformSetting,
) {
  const desiredMarker = nonproductionEnvironmentId
    ? createNonproductionEnvironmentMarker(nonproductionEnvironmentId)
    : isProduction
      ? LEGACY_PRODUCTION_ENVIRONMENT
      : null;

  let setting = await settings.findOne({ key: DEPLOYMENT_ENVIRONMENT_KEY }).lean();
  if (!setting && desiredMarker !== null) {
    try {
      await settings.updateOne(
        { key: DEPLOYMENT_ENVIRONMENT_KEY },
        { $setOnInsert: { value: desiredMarker } },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
    setting = await settings.findOne({ key: DEPLOYMENT_ENVIRONMENT_KEY }).lean();
  }

  if (!setting && desiredMarker === null) {
    return;
  }

  assertWorkerMayUseDatabase({
    isProduction,
    marker: setting?.value,
    nonproductionEnvironmentId,
  });
}
