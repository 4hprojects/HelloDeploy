#!/usr/bin/env node
/**
 * HelloDeploy secret generator.
 *
 * Generates cryptographically secure values for all required secrets and
 * either prints them to stdout or writes them directly into a .env file.
 *
 * Usage:
 *   node scripts/generate-secrets.js             # print to stdout
 *   node scripts/generate-secrets.js --write     # append to .env (creates if missing)
 *   node scripts/generate-secrets.js --write --output /path/to/.env
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ARGS = process.argv.slice(2);
const WRITE_MODE = ARGS.includes('--write');
const ENV_FLAG   = ARGS.indexOf('--output');
const ENV_PATH   = ENV_FLAG >= 0 ? resolve(ARGS[ENV_FLAG + 1]) : resolve(process.cwd(), '.env');

// ─── generate ─────────────────────────────────────────────────────────────────

const secrets = {
  SESSION_SECRET:         randomBytes(64).toString('hex'),
  HELLODEPLOY_MASTER_KEY: randomBytes(32).toString('base64'),
  GITHUB_WEBHOOK_SECRET:  randomBytes(32).toString('hex'),
};

// ─── output ───────────────────────────────────────────────────────────────────

if (!WRITE_MODE) {
  console.log('\n# Generated secrets — add these to your .env file\n');
  for (const [key, value] of Object.entries(secrets)) {
    console.log(`${key}=${value}`);
  }
  console.log('\n# IMPORTANT: Store HELLODEPLOY_MASTER_KEY outside MongoDB and source control.');
  console.log('# If you lose it, all stored environment secrets become permanently unreadable.\n');
  process.exit(0);
}

// Write mode: merge into existing .env without overwriting keys already set.
let existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';

let appended = 0;
for (const [key, value] of Object.entries(secrets)) {
  const alreadySet = new RegExp(`^${key}=`, 'm').test(existing);
  if (alreadySet) {
    console.log(`  ↷  ${key} already set — skipping`);
    continue;
  }
  existing += (existing.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
  console.log(`  ✓  ${key} written`);
  appended++;
}

if (appended > 0) {
  writeFileSync(ENV_PATH, existing, 'utf8');
  console.log(`\nSecrets written to ${ENV_PATH}`);
  console.log('IMPORTANT: Back up HELLODEPLOY_MASTER_KEY separately — losing it is permanent.\n');
} else {
  console.log('\nAll secrets already present — nothing written.\n');
}
