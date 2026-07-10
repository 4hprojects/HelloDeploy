import 'dotenv/config';
import { accessSync, constants as fsConstants } from 'node:fs';
import {
  assertAllOrNoneEnvironment,
  assertPairedEnvironment,
  assertProductionSecrets,
  parseIntegerEnv,
} from '@hellodeploy/contracts';

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
const port = parseIntegerEnv('PORT', optional('PORT', '3000'), { min: 1, max: 65535 });
const redisPort = parseIntegerEnv('REDIS_PORT', optional('REDIS_PORT', '6379'), {
  min: 1,
  max: 65535,
});
const sessionSecret = production
  ? required('SESSION_SECRET')
  : optional('SESSION_SECRET', 'dev-session-secret-change-in-production');
const masterKey = production
  ? required('HELLODEPLOY_MASTER_KEY')
  : optional('HELLODEPLOY_MASTER_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');

if (production) {
  assertProductionSecrets({ sessionSecret, masterKey });
  assertPairedEnvironment(
    'TURNSTILE_SITE_KEY',
    process.env.TURNSTILE_SITE_KEY,
    'TURNSTILE_SECRET_KEY',
    process.env.TURNSTILE_SECRET_KEY,
  );
  assertAllOrNoneEnvironment(
    [
      ['GITHUB_APP_ID', process.env.GITHUB_APP_ID],
      ['GITHUB_APP_NAME', process.env.GITHUB_APP_NAME],
      [
        'GITHUB_APP_PRIVATE_KEY',
        process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY,
      ],
      ['GITHUB_WEBHOOK_SECRET', process.env.GITHUB_WEBHOOK_SECRET],
    ],
    'GitHub App',
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
  PORT: port,
  HOST: optional('HOST', 'localhost'),

  SESSION_SECRET: sessionSecret,

  MONGODB_URI: production
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
  HELLODEPLOY_MASTER_KEY: masterKey,

  // Redis — required for deployment queue
  REDIS_HOST: optional('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: redisPort,
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
    !!(
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_NAME &&
      (process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY)
    ),
};
