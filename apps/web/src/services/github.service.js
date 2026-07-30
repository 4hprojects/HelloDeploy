import { createSign, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';
import { normalizePublicGithubRepositoryUrl, RepositorySourceError } from '@hellodeploy/contracts';

const PUBLIC_GITHUB_TIMEOUT_MS = 10_000;
const PUBLIC_GITHUB_MAX_RESPONSE_BYTES = 1_000_000;

function isSafeBranchName(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  );
}

async function readBoundedJson(res) {
  const declaredLength = Number.parseInt(res.headers.get('content-length') ?? '0', 10);
  if (declaredLength > PUBLIC_GITHUB_MAX_RESPONSE_BYTES) {
    throw new RepositorySourceError('REPOSITORY_UNAVAILABLE', 'Repository response was too large.');
  }
  const chunks = [];
  let receivedBytes = 0;
  const reader = res.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      receivedBytes += value.byteLength;
      if (receivedBytes > PUBLIC_GITHUB_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RepositorySourceError(
          'REPOSITORY_UNAVAILABLE',
          'Repository response was too large.',
        );
      }
      chunks.push(Buffer.from(value));
    }
  }
  const text = reader ? Buffer.concat(chunks).toString('utf8') : await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new RepositorySourceError(
      'REPOSITORY_UNAVAILABLE',
      'GitHub returned an invalid response.',
    );
  }
}

async function fetchPublicGithub(path) {
  let res;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(PUBLIC_GITHUB_TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'hellodeploy',
      },
    });
  } catch {
    throw new RepositorySourceError(
      'REPOSITORY_UNAVAILABLE',
      'The repository could not be checked. Try again.',
    );
  }
  if (res.status === 404) {
    throw new RepositorySourceError(
      'REPOSITORY_NOT_PUBLIC',
      'The repository was not found or is not public. Connect GitHub for private repositories.',
    );
  }
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new RepositorySourceError(
      'REPOSITORY_RATE_LIMITED',
      'GitHub public repository checks are temporarily limited. Try again later.',
    );
  }
  if (!res.ok) {
    throw new RepositorySourceError(
      'REPOSITORY_UNAVAILABLE',
      'The repository could not be checked. Try again.',
    );
  }
  return readBoundedJson(res);
}

export async function inspectPublicGithubRepository(repositoryUrl) {
  const normalized = normalizePublicGithubRepositoryUrl(repositoryUrl);
  const data = await fetchPublicGithub(
    `/repos/${encodeURIComponent(normalized.ownerLogin)}/${encodeURIComponent(normalized.name)}`,
  );
  if (data.private || data.visibility === 'private') {
    throw new RepositorySourceError(
      'REPOSITORY_NOT_PUBLIC',
      'The repository is private. Connect GitHub to authorize access.',
    );
  }
  return {
    ...normalized,
    githubRepoId: Number.isSafeInteger(data.id) ? data.id : null,
    nodeId: typeof data.node_id === 'string' ? data.node_id : null,
    defaultBranch: typeof data.default_branch === 'string' ? data.default_branch : 'main',
    visibility: 'public',
  };
}

export async function listPublicGithubBranches(source) {
  const data = await fetchPublicGithub(
    `/repos/${encodeURIComponent(source.ownerLogin)}/${encodeURIComponent(source.name)}/branches?per_page=100`,
  );
  if (!Array.isArray(data)) {
    throw new RepositorySourceError(
      'REPOSITORY_UNAVAILABLE',
      'GitHub returned an invalid response.',
    );
  }
  return data
    .filter((branch) => isSafeBranchName(branch?.name))
    .map((branch) => ({ name: branch.name, sha: branch.commit?.sha ?? null }));
}

export async function getPublicGithubLatestCommit(source, branch) {
  if (!isSafeBranchName(branch)) {
    throw new RepositorySourceError('BRANCH_NOT_FOUND', 'Select a valid repository branch.');
  }
  let data;
  try {
    data = await fetchPublicGithub(
      `/repos/${encodeURIComponent(source.ownerLogin)}/${encodeURIComponent(source.name)}/commits/${encodeURIComponent(branch)}`,
    );
  } catch (err) {
    if (err.code === 'REPOSITORY_NOT_PUBLIC') {
      throw new RepositorySourceError('BRANCH_NOT_FOUND', 'The selected branch was not found.');
    }
    throw err;
  }
  if (typeof data.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(data.sha)) {
    throw new RepositorySourceError('BRANCH_NOT_FOUND', 'The selected branch was not found.');
  }
  const committedAt = data.commit?.author?.date ? new Date(data.commit.author.date) : null;
  return {
    sha: data.sha.toLowerCase(),
    message: String(data.commit?.message ?? '')
      .split('\n')[0]
      .slice(0, 200),
    authorName: data.commit?.author?.name ?? 'Unknown',
    committedAt: committedAt && !Number.isNaN(committedAt.getTime()) ? committedAt : null,
  };
}

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
