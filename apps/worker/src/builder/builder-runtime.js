import { BUILDER_STATUS_KEY } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

import { env } from '../config/env.js';
import { verifyRemoteBuildBuilder } from '../deployment/build.js';
import { verifyRegistryAccess } from '../deployment/registry.js';
import { createBuilderController } from './builder-controller.js';
import { loadBuilderSettings, loadPlatformRole } from './builder-settings.js';
import { readHostResources } from './host-resources.js';
import { createUnitControl } from './unit-control.js';

const STATUS_TTL_SECONDS = 120;
// A probe against a hung socket would otherwise hold the build job, and with
// it the one-job deployment queue, indefinitely.
const PROBE_TIMEOUT_MS = 30_000;

/** The builder controller wired to systemd, BuildKit, the registry, and Redis. */
export function createBuilderRuntime({ redis, logger }) {
  return createBuilderController({
    unitControl: createUnitControl({ unit: env.BUILDER_CONTROL_UNIT }),
    verifyBuilder: () =>
      withTimeout(
        verifyRemoteBuildBuilder(env.BUILDER_CONTROL_BUILDX_NAME, undefined, {
          expectedEndpoint: env.BUILDER_CONTROL_ENDPOINT,
        }),
        'The build service check',
      ),
    verifyRegistry: () =>
      withTimeout(verifyRegistryAccess(env.USER_IMAGE_REGISTRY), 'The registry check'),
    readResources: () =>
      readHostResources({
        workspacePath: env.BUILD_WORKSPACE_ROOT,
        storePath: env.BUILDER_CONTROL_STORE_PATH,
        unit: env.BUILDER_CONTROL_UNIT,
      }),
    readSettings: loadBuilderSettings,
    // A command on a disconnected client would queue forever; the next tick retries.
    publishStatus: async (status) => {
      if (redis.status === 'ready') {
        await redis.set(BUILDER_STATUS_KEY, JSON.stringify(status), 'EX', STATUS_TTL_SECONDS);
      }
    },
    writeAudit: writeAuditEvent,
    loadActorRole: loadPlatformRole,
    logger,
  });
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not answer within ${PROBE_TIMEOUT_MS / 1000} s.`)),
      PROBE_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
