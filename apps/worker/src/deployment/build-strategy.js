import {
  BuildStrategy,
  RuntimeType,
  JAVA_PORT,
  PHP_PORT,
  getBuildStrategyRuntime,
  isJavaBuildStrategy,
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
  javaVersion = null,
}) {
  const runtime = resolveRuntimeSpec(snapshot);
  const buildStrategy = snapshot.buildStrategy ?? BuildStrategy.LEGACY_GENERATED;
  const config = snapshot.buildConfiguration;
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
      javaVersion,
      buildArgNames,
      templateVersion,
    }),
    runtime,
  };
}

/**
 * The container port and routing behavior a snapshot runs with. Rollback uses
 * this alone: it reuses a built image and never regenerates its Dockerfile.
 */
export function resolveRuntimeSpec(snapshot) {
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
  // PHP and Java templates fix their server port, like static sites.
  const appPort = isStatic
    ? STATIC_PORT
    : isPhpBuildStrategy(buildStrategy)
      ? PHP_PORT
      : isJavaBuildStrategy(buildStrategy)
        ? JAVA_PORT
        : (config.applicationPort ?? defaultPort);
  return {
    appPort,
    static: isStatic,
    streaming: [BuildStrategy.NEXT_STANDARD_V1, BuildStrategy.NEXT_STANDALONE_V1].includes(
      buildStrategy,
    ),
  };
}
