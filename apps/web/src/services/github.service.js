import { createSign, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';

// ─── Private key loading ───────────────────────────────────────────────────────

let _privateKey = null;

function loadPrivateKey() {
  if (_privateKey) {
    return _privateKey;
  }

  if (env.GITHUB_APP_PRIVATE_KEY_PATH) {
    try {
      _privateKey = readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH, 'utf8');
      return _privateKey;
    } catch (err) {
      logger.warn('GitHub App private key file not readable', {
        path: env.GITHUB_APP_PRIVATE_KEY_PATH,
        code: err.code,
      });
    }
  }

  if (env.GITHUB_APP_PRIVATE_KEY) {
    _privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
    return _privateKey;
  }

  return null;
}

// ─── App JWT (short-lived, 10 minutes max) ─────────────────────────────────────
// Uses Node.js built-in crypto — no jsonwebtoken dependency.

function generateAppJWT() {
  const privateKey = loadPrivateKey();
  if (!privateKey) {
    throw new Error('GitHub App private key is not configured.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60, // 60 s in the past to account for clock drift
      exp: now + 600, // 10 minutes
      iss: String(env.GITHUB_APP_ID),
    }),
  ).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');

  return `${header}.${payload}.${signature}`;
}

// ─── Installation token (short-lived, NOT stored, NOT logged) ──────────────────

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
        'User-Agent': 'hellodeploy',
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub installation token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.token; // NEVER log this value
}

// ─── Public API helpers ────────────────────────────────────────────────────────

export function getInstallationUrl() {
  if (!env.GITHUB_APP_NAME) {
    throw new Error('GITHUB_APP_NAME is not configured.');
  }
  return `https://github.com/apps/${env.GITHUB_APP_NAME}/installations/new`;
}

/**
 * Lists repositories accessible to the given installation.
 * Returns simplified objects — no secrets, no raw token.
 */
export async function listInstallationRepos(installationId) {
  const token = await getInstallationToken(installationId);

  const res = await fetch('https://api.github.com/installation/repositories?per_page=100', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hellodeploy',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to list installation repositories (${res.status})`);
  }

  const data = await res.json();
  return data.repositories.map((r) => ({
    id: r.id,
    nodeId: r.node_id,
    fullName: r.full_name,
    name: r.name,
    ownerLogin: r.owner.login,
    defaultBranch: r.default_branch,
    visibility: r.visibility,
    private: r.private,
  }));
}

/**
 * Lists branch names for a repository.
 */
export async function listBranches(installationId, fullName) {
  const token = await getInstallationToken(installationId);
  const [owner, repo] = fullName.split('/');

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hellodeploy',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to list branches for ${fullName} (${res.status})`);
  }

  const data = await res.json();
  return data.map((b) => ({ name: b.name, sha: b.commit.sha }));
}

/**
 * Gets the latest commit on a branch.
 * Returns { sha, message, authorName, committedAt }.
 */
export async function getLatestCommit(installationId, fullName, branch) {
  const token = await getInstallationToken(installationId);
  const [owner, repo] = fullName.split('/');

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'hellodeploy',
      },
    },
  );

  if (!res.ok) {
    const error = new Error(
      `Failed to get latest commit for ${fullName}@${branch} (${res.status})`,
    );
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  return {
    sha: data.sha,
    message: data.commit.message.split('\n')[0].slice(0, 200),
    authorName: data.commit.author?.name ?? 'Unknown',
    committedAt: data.commit.author?.date ? new Date(data.commit.author.date) : null,
  };
}

// ─── Webhook signature verification ───────────────────────────────────────────

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  try {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(signatureHeader, 'utf8');
    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch (err) {
    logger.debug('Webhook signature comparison failed on malformed input', {
      error: err.message,
    });
    return false;
  }
}
