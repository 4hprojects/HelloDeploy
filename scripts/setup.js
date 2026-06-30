#!/usr/bin/env node
/**
 * HelloDeploy first-time setup wizard.
 *
 * Guides the administrator through configuring the platform by writing a
 * production-ready .env file.  Run after installing dependencies.
 *
 * Usage:
 *   node scripts/setup.js
 *   node scripts/setup.js --output /path/to/.env   # custom output path
 *   node scripts/setup.js --skip-existing             # keep values already in .env
 */
import readline from 'node:readline/promises';
import { stdin, stdout, argv } from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ARGS = argv.slice(2);
const ENV_FLAG = ARGS.indexOf('--output');
const ENV_PATH = ENV_FLAG >= 0 ? resolve(ARGS[ENV_FLAG + 1]) : resolve(process.cwd(), '.env');
const SKIP_EXISTING = ARGS.includes('--skip-existing');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ─── existing env loader ───────────────────────────────────────────────────────

function loadEnv(path) {
  if (!existsSync(path)) {
    return {};
  }
  const map = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      map[m[1]] = m[2];
    }
  }
  return map;
}

// ─── prompt helpers ───────────────────────────────────────────────────────────

async function ask(rl, question, defaultValue, sensitive = false) {
  const hint = defaultValue ? `${DIM}[${sensitive ? '(set)' : defaultValue}]${RESET} ` : '';
  const raw = await rl.question(`  ${question} ${hint}> `);
  return raw.trim() || defaultValue || '';
}

async function confirm(rl, question) {
  const raw = await rl.question(`  ${question} [y/N] > `);
  return raw.trim().toLowerCase() === 'y';
}

// ─── main ─────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: stdin, output: stdout });

console.log(`\n${BOLD}HelloDeploy Setup Wizard${RESET}`);
console.log('─'.repeat(50));
console.log(`Writing to: ${CYAN}${ENV_PATH}${RESET}\n`);

const existing = loadEnv(ENV_PATH);
const config = { ...existing };

const skip = (key) => SKIP_EXISTING && key in existing && existing[key] !== '';

// ── Section 1: server ─────────────────────────────────────────────────────────
console.log(`${BOLD}1. Server${RESET}`);
if (!skip('NODE_ENV')) {
  config.NODE_ENV = 'production';
}
if (!skip('PORT')) {
  config.PORT = await ask(rl, 'Web port', existing.PORT || '3000');
}
if (!skip('HOST')) {
  config.HOST = await ask(rl, 'Bind host', existing.HOST || '0.0.0.0');
}

// ── Section 2: platform domain ────────────────────────────────────────────────
console.log(`\n${BOLD}2. Platform domain${RESET}`);
const domain = await ask(
  rl,
  'Platform domain (e.g. hellodeploy.example.com)',
  existing.PLATFORM_DOMAIN || '',
);
config.PLATFORM_DOMAIN = domain;
config.PLATFORM_SUBDOMAIN_SUFFIX = await ask(
  rl,
  'App subdomain suffix',
  existing.PLATFORM_SUBDOMAIN_SUFFIX || `.apps.${domain}`,
);

// ── Section 3: MongoDB ────────────────────────────────────────────────────────
console.log(`\n${BOLD}3. MongoDB${RESET}`);
if (!skip('MONGODB_URI')) {
  config.MONGODB_URI = await ask(
    rl,
    'MongoDB URI',
    existing.MONGODB_URI || 'mongodb://127.0.0.1:27017/hellodeploy',
  );
}

// ── Section 4: Redis ──────────────────────────────────────────────────────────
console.log(`\n${BOLD}4. Redis${RESET}`);
if (!skip('REDIS_HOST')) {
  config.REDIS_HOST = await ask(rl, 'Redis host', existing.REDIS_HOST || '127.0.0.1');
}
if (!skip('REDIS_PORT')) {
  config.REDIS_PORT = await ask(rl, 'Redis port', existing.REDIS_PORT || '6379');
}
const hasRedisPassword = await confirm(rl, 'Does Redis require a password?');
if (hasRedisPassword && !skip('REDIS_PASSWORD')) {
  config.REDIS_PASSWORD = await ask(rl, 'Redis password', existing.REDIS_PASSWORD || '', true);
}

// ── Section 5: email ──────────────────────────────────────────────────────────
console.log(`\n${BOLD}5. Email (Resend)${RESET}`);
if (!skip('RESEND_API_KEY')) {
  config.RESEND_API_KEY = await ask(
    rl,
    'Resend API key (re_...)',
    existing.RESEND_API_KEY || '',
    true,
  );
}
if (!skip('EMAIL_FROM')) {
  config.EMAIL_FROM = await ask(rl, 'From address', existing.EMAIL_FROM || `noreply@${domain}`);
}

// ── Section 6: GitHub App ─────────────────────────────────────────────────────
console.log(`\n${BOLD}6. GitHub App${RESET}`);
console.log(`  ${DIM}Register at: https://github.com/settings/apps/new${RESET}`);
if (!skip('GITHUB_APP_ID')) {
  config.GITHUB_APP_ID = await ask(rl, 'App ID', existing.GITHUB_APP_ID || '');
}
if (!skip('GITHUB_APP_NAME')) {
  config.GITHUB_APP_NAME = await ask(rl, 'App slug', existing.GITHUB_APP_NAME || '');
}
if (!skip('GITHUB_APP_PRIVATE_KEY_PATH')) {
  config.GITHUB_APP_PRIVATE_KEY_PATH = await ask(
    rl,
    'Private key path',
    existing.GITHUB_APP_PRIVATE_KEY_PATH || '/etc/hellodeploy/github-app.pem',
  );
}
if (!skip('GITHUB_WEBHOOK_SECRET')) {
  config.GITHUB_WEBHOOK_SECRET = await ask(
    rl,
    'Webhook secret',
    existing.GITHUB_WEBHOOK_SECRET || '(will be generated)',
    true,
  );
}

// ── Section 7: Cloudflare Turnstile ──────────────────────────────────────────
console.log(`\n${BOLD}7. Cloudflare Turnstile (bot protection)${RESET}`);
console.log(`  ${DIM}Get keys at: https://dash.cloudflare.com/ → Turnstile${RESET}`);
if (!skip('TURNSTILE_SITE_KEY')) {
  config.TURNSTILE_SITE_KEY = await ask(rl, 'Site key', existing.TURNSTILE_SITE_KEY || '');
}
if (!skip('TURNSTILE_SECRET_KEY')) {
  config.TURNSTILE_SECRET_KEY = await ask(
    rl,
    'Secret key',
    existing.TURNSTILE_SECRET_KEY || '',
    true,
  );
}

// ── Section 8: worker paths ───────────────────────────────────────────────────
console.log(`\n${BOLD}8. Worker directories${RESET}`);
if (!skip('BUILD_WORKSPACE_ROOT')) {
  config.BUILD_WORKSPACE_ROOT = await ask(
    rl,
    'Build workspace',
    existing.BUILD_WORKSPACE_ROOT || '/var/lib/hellodeploy/builds',
  );
}
if (!skip('RELEASE_METADATA_ROOT')) {
  config.RELEASE_METADATA_ROOT = await ask(
    rl,
    'Release metadata',
    existing.RELEASE_METADATA_ROOT || '/var/lib/hellodeploy/releases',
  );
}
if (!skip('PROJECT_VOLUME_ROOT')) {
  config.PROJECT_VOLUME_ROOT = await ask(
    rl,
    'Project volumes',
    existing.PROJECT_VOLUME_ROOT || '/var/lib/hellodeploy/projects',
  );
}
if (!skip('NGINX_HELLODEPLOY_CONFIG_DIR')) {
  config.NGINX_HELLODEPLOY_CONFIG_DIR = await ask(
    rl,
    'Nginx config dir',
    existing.NGINX_HELLODEPLOY_CONFIG_DIR || '/etc/nginx/hellodeploy.d',
  );
}
config.NGINX_ENABLED = 'true';
config.WORKER_CONCURRENCY = await ask(rl, 'Worker concurrency', existing.WORKER_CONCURRENCY || '1');

rl.close();

// ── Generate missing secrets ──────────────────────────────────────────────────
console.log(`\n${BOLD}Generating missing secrets…${RESET}`);
const genResult = spawnSync(
  process.execPath,
  [resolve(__dirname, 'generate-secrets.js'), '--write', '--output', ENV_PATH],
  {
    encoding: 'utf8',
    env: { ...process.env },
  },
);
if (genResult.stdout) {
  process.stdout.write(genResult.stdout);
}
if (genResult.stderr) {
  process.stderr.write(genResult.stderr);
}

// ── Write collected config ────────────────────────────────────────────────────
let lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';

for (const [key, value] of Object.entries(config)) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(lines)) {
    lines = lines.replace(re, line);
  } else {
    lines += (lines.endsWith('\n') ? '' : '\n') + line + '\n';
  }
}

writeFileSync(ENV_PATH, lines, 'utf8');

console.log(
  `\n${GREEN}${BOLD}Setup complete.${RESET} Configuration written to ${CYAN}${ENV_PATH}${RESET}`,
);
console.log(`\nNext steps:`);
console.log(`  1. Review ${ENV_PATH} and verify all values`);
console.log(`  2. Back up HELLODEPLOY_MASTER_KEY to a secure location outside this server`);
console.log(`  3. Create the nginx hellodeploy.d directory:`);
console.log(
  `     sudo mkdir -p ${config.NGINX_HELLODEPLOY_CONFIG_DIR || '/etc/nginx/hellodeploy.d'}`,
);
console.log(
  `     echo 'include ${config.NGINX_HELLODEPLOY_CONFIG_DIR || '/etc/nginx/hellodeploy.d'}/*.conf;' | sudo tee /etc/nginx/conf.d/hellodeploy.conf`,
);
console.log(`  4. Run the super admin seeder:  node scripts/seed-super-admin.js`);
console.log(`  5. Start with PM2:  pm2 start ecosystem.config.cjs\n`);
