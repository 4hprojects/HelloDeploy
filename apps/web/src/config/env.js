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
  PORT: parseInt(optional('PORT', '3000'), 10),
  HOST: optional('HOST', 'localhost'),

  SESSION_SECRET:
    process.env.NODE_ENV === 'production'
      ? required('SESSION_SECRET')
      : optional('SESSION_SECRET', 'dev-session-secret-change-in-production'),

  MONGODB_URI:
    process.env.NODE_ENV === 'production'
      ? required('MONGODB_URI')
      : optional('MONGODB_URI', 'mongodb://127.0.0.1:27017/hellodeploy'),

  PLATFORM_DOMAIN: optional('PLATFORM_DOMAIN', `localhost:${optional('PORT', '3000')}`),
  PLATFORM_SUBDOMAIN_SUFFIX: optional('PLATFORM_SUBDOMAIN_SUFFIX', '.apps.hellodeploy.online'),

  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  EMAIL_FROM: optional('EMAIL_FROM', 'noreply@hellodeploy.online'),

  TURNSTILE_SITE_KEY: optional('TURNSTILE_SITE_KEY', ''),
  TURNSTILE_SECRET_KEY: optional('TURNSTILE_SECRET_KEY', ''),

  // Master encryption key for environment secrets (base64-encoded 32 bytes).
  // Required in production; a dev-only placeholder is used in development.
  HELLODEPLOY_MASTER_KEY:
    process.env.NODE_ENV === 'production'
      ? required('HELLODEPLOY_MASTER_KEY')
      : optional('HELLODEPLOY_MASTER_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),

  // Redis — required for deployment queue
  REDIS_HOST: optional('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: parseInt(optional('REDIS_PORT', '6379'), 10),
  REDIS_PASSWORD: optional('REDIS_PASSWORD', undefined),

  // GitHub App — all optional in dev; required to use GitHub features
  GITHUB_APP_ID: optional('GITHUB_APP_ID', ''),
  GITHUB_APP_NAME: optional('GITHUB_APP_NAME', ''),
  GITHUB_APP_PRIVATE_KEY_PATH: optional('GITHUB_APP_PRIVATE_KEY_PATH', ''),
  GITHUB_APP_PRIVATE_KEY: optional('GITHUB_APP_PRIVATE_KEY', ''),
  GITHUB_WEBHOOK_SECRET: optional('GITHUB_WEBHOOK_SECRET', ''),

  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV !== 'production',
  isGithubConfigured: () =>
    !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_NAME &&
       (process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY)),
};
