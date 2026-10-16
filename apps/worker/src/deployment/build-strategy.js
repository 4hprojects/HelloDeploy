import {
  BuildStrategy,
  RuntimeType,
  PHP_PORT,
  getBuildStrategyRuntime,
  isPhpBuildStrategy,
  isPythonBuildStrategy,
} from '@hellodeploy/contracts';
import { generateDockerfile, STATIC_PORT } from './dockerfile-generator.js';

export function resolveBuildStrategy({
  snapshot,
  templateVersion,
  buildArgNames = [],
  pythonVersion = null,
  phpVersion = null,
}) {
  if (!snapshot?.runtimeType || !snapshot?.buildConfiguration) {
    throw new Error('Deployment configuration snapshot is incomplete.');
  }
  const buildStrategy = snapshot.buildStrategy ?? BuildStrategy.LEGACY_GENERATED;
  const requiredRuntime = getBuildStrategyRuntime(buildStrategy);
  if (requiredRuntime && snapshot.runtimeType !== requiredRuntime) {
    throw new Error(`The ${buildStrategy} build strategy requires the ${requiredRuntime} runtime.`);
  }
  const config = snapshot.buildConfiguration;
  const isStatic =
    [RuntimeType.STATIC, RuntimeType.REACT, RuntimeType.VUE].includes(snapshot.runtimeType) ||
    buildStrategy === BuildStrategy.NEXT_EXPORT_V1;
  const defaultPort = isPythonBuildStrategy(buildStrategy) ? 8000 : 3000;
  // The PHP image's web server port is fixed by the template, like static sites.
  const appPort = isStatic
    ? STATIC_PORT
    : isPhpBuildStrategy(buildStrategy)
      ? PHP_PORT
      : (config.applicationPort ?? defaultPort);
  return {
    strategyId: buildStrategy,
    applicationRoot: config.applicationRoot ?? '.',
    dockerfileContent: generateDockerfile({
      runtimeType: snapshot.runtimeType,
      buildStrategy,
      buildCommand: config.buildCommand ?? null,
      startCommand: config.startCommand ?? null,
      outputDirectory: config.outputDirectory ?? null,
      applicationPort: config.applicationPort ?? null,
      applicationModule: config.applicationModule ?? null,
      pythonVersion,
      phpVersion,
      buildArgNames,
      templateVersion,
    }),
    runtime: {
      appPort,
      static: isStatic,
      streaming: [BuildStrategy.NEXT_STANDARD_V1, BuildStrategy.NEXT_STANDALONE_V1].includes(
        buildStrategy,
      ),
    },
  };
}
