import 'dotenv/config';
import { accessSync, constants as fsConstants } from 'node:fs';
import {
  assertAllOrNoneEnvironment,
  assertPairedEnvironment,
  assertProductionSecrets,
  parseHostnameEnv,
  parseIntegerEnv,
  required,
  optional,
  ConfigurationError,
  isPilotStrategyEnabledFor,
} from '@hellodeploy/contracts';
import { resolveRedisConnectionConfig } from '@hellodeploy/queue';

const nodeEnv = optional('NODE_ENV', 'development');
const production = nodeEnv === 'production';
const port = parseIntegerEnv('PORT', optional('PORT', '3000'), { min: 1, max: 65535 });
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
const sessionSecret = production
  ? required('SESSION_SECRET')
  : optional('SESSION_SECRET', 'dev-session-secret-change-in-production');
const masterKey = production
  ? required('HELLODEPLOY_MASTER_KEY')
  : optional('HELLODEPLOY_MASTER_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
const nextMasterKey = optional('HELLODEPLOY_MASTER_KEY_NEXT', '');
const platformDomainRaw = optional('PLATFORM_DOMAIN', `localhost:${optional('PORT', '3000')}`);
const platformSubdomainSuffix = optional('PLATFORM_SUBDOMAIN_SUFFIX', '.hellodeploy.online');
const deploymentDomainRaw = optional(
  'DEPLOYMENT_DOMAIN',
  platformSubdomainSuffix.startsWith('.')
    ? platformSubdomainSuffix.slice(1)
    : platformSubdomainSuffix,
);
const platformDomain = production
  ? parseHostnameEnv('PLATFORM_DOMAIN', platformDomainRaw)
  : platformDomainRaw;
const deploymentDomain = production
  ? parseHostnameEnv('DEPLOYMENT_DOMAIN', deploymentDomainRaw)
  : deploymentDomainRaw;
function parsePilotFlag(prefix) {
  return {
    enabled: optional(`${prefix}_ENABLED`, 'false') === 'true',
    projectIds: new Set(
      optional(`${prefix}_PROJECT_IDS`, '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  };
}
const nextPilot = parsePilotFlag('MULTIRUNTIME_NEXT_V1');
const pythonPilot = parsePilotFlag('MULTIRUNTIME_PYTHON_V1');
const phpPilot = parsePilotFlag('MULTIRUNTIME_PHP_V1');
const javaPilot = parsePilotFlag('MULTIRUNTIME_JAVA_V1');
const dockerfilePilot = parsePilotFlag('MULTIRUNTIME_DOCKERFILE_V1');
const ociPilot = parsePilotFlag('MULTIRUNTIME_OCI_V1');
// The on-demand builder that administrators start and stop. The web only reads
// its status and queues requests; the worker owns it.
const builderControlEnabled = optional('BUILDER_CONTROL_ENABLED', 'false') === 'true';
if (builderControlEnabled && (dockerfilePilot.enabled || ociPilot.enabled)) {
  throw new ConfigurationError(
    'BUILDER_CONTROL_ENABLED must not be combined with MULTIRUNTIME_DOCKERFILE_V1_ENABLED or MULTIRUNTIME_OCI_V1_ENABLED.',
  );
}

assertPairedEnvironment(
  'GOOGLE_CLIENT_ID',
  process.env.GOOGLE_CLIENT_ID,
  'GOOGLE_CLIENT_SECRET',
  process.env.GOOGLE_CLIENT_SECRET,
);
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
assertAllOrNoneEnvironment(
  [
    ['CLOUDFLARE_API_TOKEN', process.env.CLOUDFLARE_API_TOKEN],
    ['CLOUDFLARE_ZONE_ID', process.env.CLOUDFLARE_ZONE_ID],
    ['CUSTOM_HOSTNAME_TARGET', process.env.CUSTOM_HOSTNAME_TARGET],
  ],
  'Cloudflare custom hostnames',
);
if (production) {
  assertPairedEnvironment(
    'TURNSTILE_SITE_KEY',
    process.env.TURNSTILE_SITE_KEY,
    'TURNSTILE_SECRET_KEY',
    process.env.TURNSTILE_SECRET_KEY,
  );
}

if (production) {
  if (platformSubdomainSuffix !== `.${deploymentDomain}`) {
    throw new ConfigurationError(
      'PLATFORM_SUBDOMAIN_SUFFIX must equal a dot followed by DEPLOYMENT_DOMAIN.',
    );
  }
  assertProductionSecrets({ sessionSecret, masterKey, nextMasterKey });
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
      throw new ConfigurationError('GITHUB_APP_PRIVATE_KEY_PATH must reference a readable file.');
    }
  }
}

// Shared with the worker (same root .env): the plan defaults for projects
// without a quota override, so admin and settings pages show what the worker applies.
const runtimeMemoryMb = parseIntegerEnv('RUNTIME_MEMORY_MB', optional('RUNTIME_MEMORY_MB', '256'), {
  min: 128,
  max: 32768,
});
const buildTimeoutMs = parseIntegerEnv('BUILD_TIMEOUT_MS', optional('BUILD_TIMEOUT_MS', '600000'), {
  min: 1000,
  max: 86400000,
});
const quotaMaxMemoryMb = parseIntegerEnv(
  'QUOTA_MAX_MEMORY_MB',
  optional('QUOTA_MAX_MEMORY_MB', '2048'),
  { min: 128, max: 1048576 },
);
const quotaMaxCpuCores = parseIntegerEnv(
  'QUOTA_MAX_CPU_CORES',
  optional('QUOTA_MAX_CPU_CORES', '2'),
  { min: 1, max: 1024 },
);

export const env = {
  NODE_ENV: nodeEnv,
  PORT: port,
  HOST: optional('HOST', 'localhost'),

  SESSION_SECRET: sessionSecret,

  MONGODB_URI: production
    ? required('MONGODB_URI')
    : optional('MONGODB_URI', 'mongodb://127.0.0.1:27017/hellodeploy'),

  PLATFORM_DOMAIN: platformDomain,
  DEPLOYMENT_DOMAIN: deploymentDomain,
  PLATFORM_SUBDOMAIN_SUFFIX: platformSubdomainSuffix,

  // Cloudflare for SaaS custom hostnames; all three set enables the admin-free
  // custom domain flow, none keeps the per-domain tunnel flow.
  CLOUDFLARE_API_TOKEN: optional('CLOUDFLARE_API_TOKEN', ''),
  CLOUDFLARE_ZONE_ID: optional('CLOUDFLARE_ZONE_ID', ''),
  CUSTOM_HOSTNAME_TARGET: optional('CUSTOM_HOSTNAME_TARGET', ''),

  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  EMAIL_FROM: optional('EMAIL_FROM', 'noreply@hellodeploy.online'),
  RESEND_WEBHOOK_SECRET: optional('RESEND_WEBHOOK_SECRET', ''),

  TURNSTILE_SITE_KEY: production ? optional('TURNSTILE_SITE_KEY', '') : '',
  TURNSTILE_SECRET_KEY: production ? optional('TURNSTILE_SECRET_KEY', '') : '',

  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: optional('GOOGLE_CLIENT_SECRET', ''),

  // Master encryption key for environment secrets (base64-encoded 32 bytes).
  // Required in production; a dev-only placeholder is used in development.
  HELLODEPLOY_MASTER_KEY: masterKey,
  HELLODEPLOY_MASTER_KEY_NEXT: nextMasterKey,

  // Redis — required for deployment queue
  REDIS_URL: redisUrl,
  REDIS_HOST: optional('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: redisPort,
  REDIS_PASSWORD: optional('REDIS_PASSWORD', undefined),
  REDIS_CONNECTION: redisConfig.connection,
  REDIS_MODE: redisConfig.mode,

  // GitHub App — all optional in dev; required to use GitHub features
  GITHUB_APP_ID: optional('GITHUB_APP_ID', ''),
  GITHUB_APP_NAME: optional('GITHUB_APP_NAME', ''),
  GITHUB_APP_PRIVATE_KEY_PATH: optional('GITHUB_APP_PRIVATE_KEY_PATH', ''),
  GITHUB_APP_PRIVATE_KEY: optional('GITHUB_APP_PRIVATE_KEY', ''),
  GITHUB_WEBHOOK_SECRET: optional('GITHUB_WEBHOOK_SECRET', ''),

  RUNTIME_MEMORY_MB: runtimeMemoryMb,
  BUILD_TIMEOUT_MS: buildTimeoutMs,
  MULTIRUNTIME_NEXT_V1_ENABLED: nextPilot.enabled,
  MULTIRUNTIME_NEXT_V1_PROJECT_IDS: nextPilot.projectIds,
  MULTIRUNTIME_PYTHON_V1_ENABLED: pythonPilot.enabled,
  MULTIRUNTIME_PYTHON_V1_PROJECT_IDS: pythonPilot.projectIds,
  MULTIRUNTIME_PHP_V1_ENABLED: phpPilot.enabled,
  MULTIRUNTIME_PHP_V1_PROJECT_IDS: phpPilot.projectIds,
  MULTIRUNTIME_JAVA_V1_ENABLED: javaPilot.enabled,
  MULTIRUNTIME_JAVA_V1_PROJECT_IDS: javaPilot.projectIds,
  MULTIRUNTIME_DOCKERFILE_V1_ENABLED: dockerfilePilot.enabled,
  MULTIRUNTIME_DOCKERFILE_V1_PROJECT_IDS: dockerfilePilot.projectIds,
  MULTIRUNTIME_OCI_V1_ENABLED: ociPilot.enabled,
  MULTIRUNTIME_OCI_V1_PROJECT_IDS: ociPilot.projectIds,
  BUILDER_CONTROL_ENABLED: builderControlEnabled,
  QUOTA_MAX_MEMORY_MB: quotaMaxMemoryMb,
  QUOTA_MAX_CPU_CORES: quotaMaxCpuCores,

  // Off by default: every project waits for an admin unless this is turned on.
  AUTO_APPROVAL_ENABLED: optional('AUTO_APPROVAL_ENABLED', 'false') === 'true',

  // Learning Hub public blog at /blog. Off serves the routes as 404s.
  LEARNING_HUB_ENABLED: optional('LEARNING_HUB_ENABLED', 'false') === 'true',
  // Counts and shows approximate article views; needs the hub enabled.
  LEARNING_HUB_VIEWS_ENABLED: optional('LEARNING_HUB_VIEWS_ENABLED', 'false') === 'true',
  // Guest comments. Submissions also need Turnstile, a moderation provider, the
  // admin switch, and the article's own commentsEnabled; any missing one keeps them closed.
  LEARNING_HUB_COMMENTS_ENABLED: optional('LEARNING_HUB_COMMENTS_ENABLED', 'false') === 'true',
  LEARNING_HUB_MODERATION_PROVIDER: optional('LEARNING_HUB_MODERATION_PROVIDER', 'none'),
  OPENAI_MODERATION_API_KEY: optional('OPENAI_MODERATION_API_KEY', ''),
  // GA4 on Learning Hub pages only, and only once the owner confirms a consent
  // mechanism is in place. Either missing keeps the tag off.
  GA4_MEASUREMENT_ID: /^G-[A-Z0-9]{4,12}$/.test(optional('GA4_MEASUREMENT_ID', ''))
    ? optional('GA4_MEASUREMENT_ID', '')
    : '',
  LEARNING_HUB_ANALYTICS_CONSENT_READY:
    optional('LEARNING_HUB_ANALYTICS_CONSENT_READY', 'false') === 'true',
  // Search Console HTML-tag verification token; the meta tag is omitted while unset.
  GOOGLE_SITE_VERIFICATION: /^[A-Za-z0-9_-]{20,100}$/.test(optional('GOOGLE_SITE_VERIFICATION', ''))
    ? optional('GOOGLE_SITE_VERIFICATION', '')
    : '',
  // AdSense stays off until the site is approved and the owner authorizes it.
  ADSENSE_ENABLED: optional('ADSENSE_ENABLED', 'false') === 'true',
  ADSENSE_CLIENT_ID: /^ca-pub-\d{16}$/.test(optional('ADSENSE_CLIENT_ID', ''))
    ? optional('ADSENSE_CLIENT_ID', '')
    : '',
  ADSENSE_ARTICLE_SLOT_ID: /^\d{6,12}$/.test(optional('ADSENSE_ARTICLE_SLOT_ID', ''))
    ? optional('ADSENSE_ARTICLE_SLOT_ID', '')
    : '',

  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV !== 'production',
  isGoogleAuthConfigured: () =>
    !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  isEmailConfigured: () =>
    !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.RESEND_WEBHOOK_SECRET),
  isGithubConfigured: () =>
    !!(
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_NAME &&
      (process.env.GITHUB_APP_PRIVATE_KEY_PATH || process.env.GITHUB_APP_PRIVATE_KEY)
    ),
  /** The environment ceiling for each on-demand builder runtime family. */
  builderPilots: { next: nextPilot, python: pythonPilot, php: phpPilot, java: javaPilot },
  isStrategyEnabledFor: (strategy, projectId) =>
    isPilotStrategyEnabledFor(strategy, projectId, {
      next: nextPilot,
      python: pythonPilot,
      php: phpPilot,
      java: javaPilot,
      dockerfile: dockerfilePilot,
      oci: ociPilot,
    }),
};
