import { buildAndPushDockerImage, buildDockerImage, inspectLocalImageDigest } from './build.js';

export const BuildExecutorMode = Object.freeze({
  LOCAL: 'local',
  REMOTE_BUILDKIT: 'remote-buildkit',
});

export function createBuildExecutor({ mode, builderName, registryPrefix, deps = {} }) {
  const localBuild = deps.buildDockerImage ?? buildDockerImage;
  const remoteBuild = deps.buildAndPushDockerImage ?? buildAndPushDockerImage;
  const inspectLocal = deps.inspectLocalImageDigest ?? inspectLocalImageDigest;
  if (!Object.values(BuildExecutorMode).includes(mode)) {
    throw new Error(`Unsupported build executor mode: ${mode}`);
  }
  return {
    async build(options) {
      if (mode === BuildExecutorMode.REMOTE_BUILDKIT) {
        if (!builderName || !registryPrefix) {
          throw new Error('Remote BuildKit requires a builder name and registry prefix.');
        }
        const imageRef = `${registryPrefix}:${options.registryTag}`;
        return remoteBuild({ ...options, imageRef, builderName });
      }
      await localBuild({ ...options, imageTag: options.localImageTag, builderName });
      return inspectLocal(options.localImageTag);
    },
  };
}
