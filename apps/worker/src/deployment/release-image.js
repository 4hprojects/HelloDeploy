import {
  BuildStrategy,
  isContainerBuildStrategy,
  parseImageReference,
} from '@hellodeploy/contracts';

import { env } from '../config/env.js';
import { pullAndVerifyImage } from './container.js';
import { loadRegistryCredential, withDockerConfig } from './registry-auth.js';

/**
 * Pull the image a release runs, applying the owner-image policy when the
 * image did not come from a platform template, and the project's registry
 * credential when it is a prebuilt image.
 */
export async function pullReleaseImage(imageRef, { buildStrategy, projectId }, deps = {}) {
  const pull = deps.pullAndVerifyImage ?? pullAndVerifyImage;
  if (!isContainerBuildStrategy(buildStrategy)) {
    return pull(imageRef);
  }
  const policy = {
    requireNonRootUser: true,
    rejectVolumes: true,
    maxImageBytes: env.CUSTOM_IMAGE_MAX_MB * 1024 * 1024,
  };
  if (buildStrategy !== BuildStrategy.OCI_IMAGE_V1) {
    return pull(imageRef, undefined, { policy });
  }
  const { registry } = parseImageReference(imageRef);
  const credential = await (deps.loadRegistryCredential ?? loadRegistryCredential)(
    projectId,
    registry,
  );
  return (deps.withDockerConfig ?? withDockerConfig)(registry, credential, (dockerConfigDir) =>
    pull(imageRef, undefined, { policy, dockerConfigDir }),
  );
}

/** Platform-built images are ours to remove on failure; prebuilt ones are not. */
export function ownsReleaseImage(buildStrategy) {
  return buildStrategy !== BuildStrategy.OCI_IMAGE_V1;
}
