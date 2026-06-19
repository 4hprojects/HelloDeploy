import 'dotenv/config';

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const optional = (name, defaultValue) => process.env[name] ?? defaultValue;

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),

  MONGODB_URI:
    process.env.NODE_ENV === 'production'
      ? required('MONGODB_URI')
      : optional('MONGODB_URI', 'mongodb://127.0.0.1:27017/hellodeploy'),

  REDIS_HOST: optional('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: parseInt(optional('REDIS_PORT', '6379'), 10),
  REDIS_PASSWORD: optional('REDIS_PASSWORD', undefined),

  WORKER_CONCURRENCY: parseInt(optional('WORKER_CONCURRENCY', '1'), 10),
  BUILD_TIMEOUT_MS: parseInt(optional('BUILD_TIMEOUT_MS', '600000'), 10),

  BUILD_WORKSPACE_ROOT: optional('BUILD_WORKSPACE_ROOT', '/var/lib/hellodeploy/builds'),
  RELEASE_METADATA_ROOT: optional('RELEASE_METADATA_ROOT', '/var/lib/hellodeploy/releases'),
  PROJECT_VOLUME_ROOT: optional('PROJECT_VOLUME_ROOT', '/var/lib/hellodeploy/projects'),
  NGINX_HELLODEPLOY_CONFIG_DIR: optional(
    'NGINX_HELLODEPLOY_CONFIG_DIR',
    '/etc/nginx/hellodeploy.d',
  ),
  NGINX_BINARY_PATH: optional('NGINX_BINARY_PATH', 'nginx'),
  PLATFORM_DOMAIN: optional('PLATFORM_DOMAIN', 'hellodeploy.online'),
  // When true the worker skips nginx operations (useful for local dev without nginx)
  NGINX_ENABLED: optional('NGINX_ENABLED', 'false') === 'true',

  // Master encryption key for decrypting environment secrets at build/runtime
  HELLODEPLOY_MASTER_KEY:
    process.env.NODE_ENV === 'production'
      ? required('HELLODEPLOY_MASTER_KEY')
      : optional('HELLODEPLOY_MASTER_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),

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
