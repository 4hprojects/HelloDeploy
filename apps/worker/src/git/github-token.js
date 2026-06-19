import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from '../config/env.js';

// ─── Private key loading ───────────────────────────────────────────────────────

let _privateKey = null;

function loadPrivateKey() {
  if (_privateKey) return _privateKey;
  if (env.GITHUB_APP_PRIVATE_KEY_PATH) {
    try {
      _privateKey = readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH, 'utf8');
      return _privateKey;
    } catch {
      // fall through to inline key
    }
  }
  if (env.GITHUB_APP_PRIVATE_KEY) {
    _privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
    return _privateKey;
  }
  return null;
}

// ─── App JWT (RS256 via node:crypto — no external JWT lib) ────────────────────

function generateAppJWT() {
  const privateKey = loadPrivateKey();
  if (!privateKey) throw new Error('GitHub App private key is not configured.');

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 600, iss: String(env.GITHUB_APP_ID) }),
  ).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');
  return `${header}.${payload}.${signature}`;
}

// ─── Installation token (short-lived, NEVER stored, NEVER logged) ─────────────

/**
 * Generate a short-lived (1 hour) GitHub App installation token.
 * The token is returned only to the caller — never stored or logged.
 *
 * @param {number} installationId
 * @returns {Promise<string>} token
 */
export async function getInstallationToken(installationId) {
  const jwt = generateAppJWT();
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'hellodeploy-worker',
      },
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub installation token request failed (${res.status})`);
  }
  const data = await res.json();
  return data.token; // NEVER log this value
}
