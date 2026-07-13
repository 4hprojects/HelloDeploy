import 'dotenv/config';
import { accessSync, constants as fsConstants } from 'node:fs';
import {
  assertAllOrNoneEnvironment,
  assertProductionSecrets,
  parseHostnameEnv,
  parseIntegerEnv,
} from '@hellodeploy/contracts';
import { resolveRedisConnectionConfig } from '@hellodeploy/queue';

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const optional = (name, defaultValue) => process.env[name] ?? defaultValue;

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
const buildTimeoutMs = parseIntegerEnv('BUILD_TIMEOUT_MS', optional('BUILD_TIMEOUT_MS', '600000'), {
  min: 1000,
  max: 86400000,
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
  throw new Error('PORT_RANGE_START must be less than or equal to PORT_RANGE_END.');
}
const masterKey = production
  ? required('HELLODEPLOY_MASTER_KEY')
  : optional('HELLODEPLOY_MASTER_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const nginxEnabled = optional('NGINX_ENABLED', 'false') === 'true';
const platformDomainRaw = optional('PLATFORM_DOMAIN', 'hellodeploy.online');
const deploymentDomainRaw = optional('DEPLOYMENT_DOMAIN', platformDomainRaw);
const platformDomain = production
  ? parseHostnameEnv('PLATFORM_DOMAIN', platformDomainRaw)
  : platformDomainRaw;
const deploymentDomain = production
  ? parseHostnameEnv('DEPLOYMENT_DOMAIN', deploymentDomainRaw)
  : deploymentDomainRaw;

if (production) {
  assertProductionSecrets({ masterKey });
  if (!nginxEnabled && process.env.NGINX_DISABLED_ACK !== 'true') {
    throw new Error(
      'NGINX_ENABLED=false requires NGINX_DISABLED_ACK=true in production to acknowledge external routing.',
    );
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
      throw new Error('GITHUB_APP_PRIVATE_KEY_PATH must reference a readable file.');
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
  BUILD_TIMEOUT_MS: buildTimeoutMs,
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

  // Master encryption key for decrypting environment secrets at build/runtime
  HELLODEPLOY_MASTER_KEY: masterKey,

  // GitHub App credentials — needed to generate installation tokens for git clone
  GITHUB_APP_ID: optional('GITHUB_APP_ID', ''),
  GITHUB_APP_PRIVATE_KEY_PATH: optional('GITHUB_APP_PRIVATE_KEY_PATH', ''),
  GITHUB_APP_PRIVATE_KEY: optional('GITHUB_APP_PRIVATE_KEY', ''),

  // Email (Resend) — optional in dev, notifications skipped without a key
  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  EMAIL_FROM: optional('EMAIL_FROM', 'HelloDeploy <noreply@hellodeploy.online>'),

  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV !== 'production',
};
