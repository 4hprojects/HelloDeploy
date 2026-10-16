import 'dotenv/config';
import { accessSync, constants as fsConstants } from 'node:fs';
import {
  assertAllOrNoneEnvironment,
  assertProductionSecrets,
  parseHostnameEnv,
  parseIntegerEnv,
  required,
  optional,
  ConfigurationError,
  isValidNonproductionEnvironmentId,
} from '@hellodeploy/contracts';
import { resolveRedisConnectionConfig } from '@hellodeploy/queue';
import {
  ImageTemplateVersion,
  parseImageTemplateVersion,
  parseOptimizedProjectIds,
} from '../deployment/template-policy.js';

const nodeEnv = optional('NODE_ENV', 'development');
const production = nodeEnv === 'production';
const redisUrl = optional('REDIS_URL', '');
const redisPort = redisUrl
  ? 6379
  : parseIntegerEnv('REDIS_PORT', optional('REDIS_PORT', '6379'), {
      min: 1,
      max: 65535,
    });
const redisConfig = resolveRedisConnectionConfig({
  url: redisUrl,
  host: optional('REDIS_HOST', '127.0.0.1'),
  port: redisPort,
  password: optional('REDIS_PASSWORD', undefined),
  production,
});
const workerConcurrency = parseIntegerEnv(
  'WORKER_CONCURRENCY',
  optional('WORKER_CONCURRENCY', '1'),
  { min: 1, max: 32 },
);
const notificationWorkerConcurrency = parseIntegerEnv(
  'NOTIFICATION_WORKER_CONCURRENCY',
  optional('NOTIFICATION_WORKER_CONCURRENCY', '4'),
  { min: 1, max: 32 },
);
const buildTimeoutMs = parseIntegerEnv('BUILD_TIMEOUT_MS', optional('BUILD_TIMEOUT_MS', '600000'), {
  min: 1000,
  max: 86400000,
});
const buildMemoryMb = parseIntegerEnv('BUILD_MEMORY_MB', optional('BUILD_MEMORY_MB', '1024'), {
  min: 256,
  max: 65536,
});
// Builder names reach `docker buildx` argv; keep them to Docker's own charset.
const BUILD_BUILDER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const buildBuilderName = optional('BUILD_BUILDER_NAME', '').trim() || null;
if (buildBuilderName && !BUILD_BUILDER_NAME_PATTERN.test(buildBuilderName)) {
  throw new ConfigurationError(
    'BUILD_BUILDER_NAME must be 1-63 lowercase letters, digits, hyphens, or underscores.',
  );
}
const userImageTemplateVersion = parseImageTemplateVersion(
  optional('USER_IMAGE_TEMPLATE_VERSION', ImageTemplateVersion.LEGACY),
);
const userImageOptimizedProjectIds = parseOptimizedProjectIds(
  optional('USER_IMAGE_OPTIMIZED_PROJECT_IDS', ''),
);
const buildExecutor = optional('BUILD_EXECUTOR', 'local');
if (!['local', 'remote-buildkit'].includes(buildExecutor)) {
  throw new ConfigurationError('BUILD_EXECUTOR must be local or remote-buildkit.');
}
const nonproductionEnvironmentId =
  optional('HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID', '').trim() || null;
if (nonproductionEnvironmentId && !isValidNonproductionEnvironmentId(nonproductionEnvironmentId)) {
  throw new ConfigurationError(
    'HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID must be 8-128 letters, digits, hyphens, or underscores and start with a letter or digit.',
  );
}
// A production worker carrying a pilot id would register a fresh production
// database as nonproduction and then refuse the real marker on later starts.
if (nonproductionEnvironmentId && production) {
  throw new ConfigurationError(
    'HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID must not be set when NODE_ENV=production.',
  );
}
const userImageRegistry = optional('USER_IMAGE_REGISTRY', '').replace(/\/$/, '').toLowerCase();
if (userImageRegistry && !/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_./-]+$/.test(userImageRegistry)) {
  throw new ConfigurationError('USER_IMAGE_REGISTRY must be a lowercase GHCR image prefix.');
}
const multiRuntimeNextV1Enabled = optional('MULTIRUNTIME_NEXT_V1_ENABLED', 'false') === 'true';
const multiRuntimeNextV1ProjectIds = parseOptimizedProjectIds(
  optional('MULTIRUNTIME_NEXT_V1_PROJECT_IDS', ''),
);
const registryManifestDeleteEnabled =
  optional('REGISTRY_MANIFEST_DELETE_ENABLED', 'false') === 'true';
if (multiRuntimeNextV1Enabled) {
  if (
    buildExecutor !== 'remote-buildkit' ||
    !buildBuilderName ||
    !userImageRegistry ||
    !registryManifestDeleteEnabled
  ) {
    throw new ConfigurationError(
      'MULTIRUNTIME_NEXT_V1_ENABLED requires remote-buildkit, BUILD_BUILDER_NAME, USER_IMAGE_REGISTRY, and REGISTRY_MANIFEST_DELETE_ENABLED=true.',
    );
  }
  if (multiRuntimeNextV1ProjectIds.size === 0) {
    throw new ConfigurationError(
      'MULTIRUNTIME_NEXT_V1_ENABLED requires a non-empty MULTIRUNTIME_NEXT_V1_PROJECT_IDS allowlist.',
    );
  }
  if (workerConcurrency !== 1) {
    throw new ConfigurationError(
      'MULTIRUNTIME_NEXT_V1_ENABLED initially requires WORKER_CONCURRENCY=1.',
    );
  }
}
const runtimeMemoryMb = parseIntegerEnv('RUNTIME_MEMORY_MB', optional('RUNTIME_MEMORY_MB', '256'), {
  min: 128,
  max: 32768,
});
const helperTimeoutMs = parseIntegerEnv(
  'NGINX_HELPER_TIMEOUT_MS',
  optional('NGINX_HELPER_TIMEOUT_MS', '15000'),
  { min: 1000, max: 60000 },
);
const portRangeStart = parseIntegerEnv('PORT_RANGE_START', optional('PORT_RANGE_START', '10000'), {
  min: 1024,
  max: 65535,
});
const portRangeEnd = parseIntegerEnv('PORT_RANGE_END', optional('PORT_RANGE_END', '19999'), {
  min: 1024,
  max: 65535,
});
if (portRangeStart > portRangeEnd) {
  throw new ConfigurationError('PORT_RANGE_START must be less than or equal to PORT_RANGE_END.');
}
const masterKey = production
  ? required('HELLODEPLOY_MASTER_KEY')
  : optional('HELLODEPLOY_MASTER_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const nextMasterKey = optional('HELLODEPLOY_MASTER_KEY_NEXT', '');
const nginxEnabled = optional('NGINX_ENABLED', 'false') === 'true';
const allowUnroutedReleases = optional('ALLOW_UNROUTED_RELEASES', 'false') === 'true';
const platformDomainRaw = optional('PLATFORM_DOMAIN', 'hellodeploy.online');
const deploymentDomainRaw = optional('DEPLOYMENT_DOMAIN', platformDomainRaw);
const platformDomain = production
  ? parseHostnameEnv('PLATFORM_DOMAIN', platformDomainRaw)
  : platformDomainRaw;
const deploymentDomain = production
  ? parseHostnameEnv('DEPLOYMENT_DOMAIN', deploymentDomainRaw)
  : deploymentDomainRaw;

if (production && (process.env.RESEND_API_KEY || process.env.RESEND_WEBHOOK_SECRET)) {
  assertAllOrNoneEnvironment(
    [
      ['RESEND_API_KEY', process.env.RESEND_API_KEY],
      ['EMAIL_FROM', process.env.EMAIL_FROM],
      ['RESEND_WEBHOOK_SECRET', process.env.RESEND_WEBHOOK_SECRET],
    ],
    'Resend email',
  );
}
if (production) {
  assertProductionSecrets({ masterKey, nextMasterKey });
  if (!nginxEnabled) {
    throw new ConfigurationError(
      'NGINX_ENABLED must be true in production for the V1 local Nginx helper.',
    );
  }
  if (allowUnroutedReleases) {
    throw new ConfigurationError('ALLOW_UNROUTED_RELEASES must not be set in production.');
  }
  assertAllOrNoneEnvironment(
    [
      ['GITHUB_APP_ID', process.env.GITHUB_APP_ID],
      [
        'GITHUB_APP_PRIVATE_KEY',
        process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY,
      ],
    ],
    'GitHub App worker',
  );
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY_PATH) {
    try {
      accessSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH, fsConstants.R_OK);
    } catch {
      throw new ConfigurationError('GITHUB_APP_PRIVATE_KEY_PATH must reference a readable file.');
    }
  }
}

export const env = {
  NODE_ENV: nodeEnv,

  MONGODB_URI: production
    ? required('MONGODB_URI')
    : optional('MONGODB_URI', 'mongodb://127.0.0.1:27017/hellodeploy'),

  REDIS_URL: redisUrl,
  REDIS_HOST: optional('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: redisPort,
  REDIS_PASSWORD: optional('REDIS_PASSWORD', undefined),
  REDIS_CONNECTION: redisConfig.connection,
  REDIS_MODE: redisConfig.mode,

  WORKER_CONCURRENCY: workerConcurrency,
  NOTIFICATION_WORKER_CONCURRENCY: notificationWorkerConcurrency,
  BUILD_TIMEOUT_MS: buildTimeoutMs,
  BUILD_MEMORY_MB: buildMemoryMb,
  BUILD_BUILDER_NAME: buildBuilderName,
  BUILD_EXECUTOR: buildExecutor,
  HELLODEPLOY_NONPRODUCTION_ENVIRONMENT_ID: nonproductionEnvironmentId,
  USER_IMAGE_REGISTRY: userImageRegistry,
  REGISTRY_MANIFEST_DELETE_ENABLED: registryManifestDeleteEnabled,
  MULTIRUNTIME_NEXT_V1_ENABLED: multiRuntimeNextV1Enabled,
  MULTIRUNTIME_NEXT_V1_PROJECT_IDS: multiRuntimeNextV1ProjectIds,
  USER_IMAGE_TEMPLATE_VERSION: userImageTemplateVersion,
  USER_IMAGE_OPTIMIZED_PROJECT_IDS: userImageOptimizedProjectIds,
  RUNTIME_MEMORY_MB: runtimeMemoryMb,
  PORT_RANGE_START: portRangeStart,
  PORT_RANGE_END: portRangeEnd,

  BUILD_WORKSPACE_ROOT: optional('BUILD_WORKSPACE_ROOT', '/var/lib/hellodeploy/builds'),
  RELEASE_METADATA_ROOT: optional('RELEASE_METADATA_ROOT', '/var/lib/hellodeploy/releases'),
  PROJECT_VOLUME_ROOT: optional('PROJECT_VOLUME_ROOT', '/var/lib/hellodeploy/projects'),
  NGINX_HELLODEPLOY_CONFIG_DIR: optional(
    'NGINX_HELLODEPLOY_CONFIG_DIR',
    '/etc/nginx/hellodeploy.d',
  ),
  NGINX_BINARY_PATH: optional('NGINX_BINARY_PATH', 'nginx'),
  NGINX_HELPER_SOCKET: optional('NGINX_HELPER_SOCKET', '/run/hellodeploy/nginx-helper.sock'),
  NGINX_HELPER_TIMEOUT_MS: helperTimeoutMs,
  PLATFORM_DOMAIN: platformDomain,
  DEPLOYMENT_DOMAIN: deploymentDomain,
  // When true the worker skips nginx operations (useful for local dev without nginx)
  NGINX_ENABLED: nginxEnabled,
  // Local pipeline testing only: lets a release go live without an Nginx route.
  ALLOW_UNROUTED_RELEASES: allowUnroutedReleases,

  // Master encryption key for decrypting environment secrets at build/runtime
  HELLODEPLOY_MASTER_KEY: masterKey,
  HELLODEPLOY_MASTER_KEY_NEXT: nextMasterKey,

  // GitHub App credentials — needed to generate installation tokens for git clone
  GITHUB_APP_ID: optional('GITHUB_APP_ID', ''),
  GITHUB_APP_PRIVATE_KEY_PATH: optional('GITHUB_APP_PRIVATE_KEY_PATH', ''),
  GITHUB_APP_PRIVATE_KEY: optional('GITHUB_APP_PRIVATE_KEY', ''),

  // Email (Resend) — optional in dev, notifications skipped without a key
  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  EMAIL_FROM: optional('EMAIL_FROM', 'HelloDeploy <noreply@hellodeploy.online>'),
  RESEND_WEBHOOK_SECRET: optional('RESEND_WEBHOOK_SECRET', ''),

  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV !== 'production',
  isEmailConfigured: () =>
    !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.RESEND_WEBHOOK_SECRET),
  isNextStrategyEnabledFor: (projectId) =>
    multiRuntimeNextV1Enabled &&
    multiRuntimeNextV1ProjectIds.has(String(projectId ?? '').toLowerCase()),
};
