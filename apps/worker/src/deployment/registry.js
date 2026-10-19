import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { Deployment } from '@hellodeploy/database';

import { env } from '../config/env.js';

const PINNED_GHCR_REFERENCE =
  /^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_./-]+(?::[a-z0-9_.-]+)?@sha256:[a-f0-9]{64}$/;
const GHCR_REPOSITORY = /^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_./-]+$/;

const GITHUB_API = 'https://api.github.com';
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const VERSIONS_PER_PAGE = 100;
// Bounds a listing that never finds its targets; 10,000 versions is far past
// what retention leaves in the platform repository.
const MAX_VERSION_PAGES = 100;
const NOT_FOUND = /MANIFEST_UNKNOWN|not found|404/i;

function runOras(args) {
  return new Promise((resolve) => {
    const stdout = [];
    const stderr = [];
    const proc = spawn('oras', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));
    proc.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    );
    proc.on('error', (error) => resolve({ code: -1, stdout: '', stderr: error.message }));
  });
}

/**
 * Probe the registry using ORAS and the worker account's Docker credential
 * store. Tokens never enter argv, environment variables, jobs, or logs. When
 * cleanup deletes through the GitHub Packages API, that token is probed too,
 * so a bad token fails at startup rather than on the first retention sweep.
 */
export async function verifyRegistryAccess(repository, deps = {}) {
  const run = deps.run ?? runOras;
  const deleteApi = deps.deleteApi ?? env.REGISTRY_DELETE_API;
  if (!GHCR_REPOSITORY.test(repository ?? '')) {
    throw new Error('Registry readiness requires a lowercase GHCR repository.');
  }
  const result = await run(['repo', 'tags', '--last', '1', repository]);
  if (result.code !== 0) {
    throw new Error(`Registry is unavailable: ${result.stderr.trim().slice(0, 500)}`);
  }
  if (deleteApi === 'github-packages') {
    await createPackagesApi(repository, deps).listVersions(1, 1);
  }
  return { ready: true };
}

/**
 * Delete one immutable GHCR image, by digest. The default `oci` mode sends the
 * OCI manifest DELETE through ORAS. `github-packages` mode exists because GHCR
 * may refuse that call: it deletes the image's package versions through the
 * GitHub REST API instead, child manifests (platform image, attestations)
 * first and the index last.
 *
 * @returns {Promise<boolean>} true when the image is gone, false when
 *   deletion is turned off.
 */
export async function deleteRegistryManifest(imageRef, deps = {}) {
  const run = deps.run ?? runOras;
  const isDeletionEnabled = deps.isDeletionEnabled ?? env.REGISTRY_MANIFEST_DELETE_ENABLED;
  const deleteApi = deps.deleteApi ?? env.REGISTRY_DELETE_API;
  if (!PINNED_GHCR_REFERENCE.test(imageRef ?? '')) {
    throw new Error('Registry cleanup requires a digest-pinned GHCR image reference.');
  }
  // Operators who keep registry history leave deletion off; nothing to do then.
  if (!isDeletionEnabled) {
    return false;
  }
  if (deleteApi === 'github-packages') {
    return deletePackageVersions(imageRef, { ...deps, run });
  }
  const result = await run(['manifest', 'delete', '--force', imageRef]);
  if (result.code !== 0) {
    // Already gone (another sweep or a rollback record sharing the digest got
    // there first): that is the state cleanup wants, so later sweeps stop.
    if (NOT_FOUND.test(result.stderr)) {
      return true;
    }
    throw new Error(`Registry manifest deletion failed: ${result.stderr.trim().slice(0, 500)}`);
  }
  return true;
}

async function deletePackageVersions(imageRef, deps) {
  const [repositoryWithTag, digest] = imageRef.split('@');
  const repository = repositoryWithTag.replace(/:[a-z0-9_.-]+$/, '');
  const childDigests = await fetchChildDigests(imageRef, deps.run);
  if (childDigests === null) {
    return true;
  }
  // A fully cached rebuild can reuse an image manifest under a new index, so a
  // child that another kept release lists must stay.
  const sharedDigests = await (deps.findSharedChildDigests ?? findSharedChildDigests)(
    digest,
    childDigests,
  );
  const targets = [...childDigests.filter((child) => !sharedDigests.has(child)), digest];
  const api = createPackagesApi(repository, deps);
  const versionIds = await api.findVersionIds(new Set(targets));
  for (const target of targets) {
    const versionId = versionIds.get(target);
    if (versionId !== undefined) {
      await api.deleteVersion(versionId);
    }
  }
  return true;
}

/** The digests an image index lists, [] for a single manifest, null when gone. */
async function fetchChildDigests(imageRef, run) {
  const result = await run(['manifest', 'fetch', imageRef]);
  if (result.code !== 0) {
    if (NOT_FOUND.test(result.stderr)) {
      return null;
    }
    throw new Error(`Registry manifest lookup failed: ${result.stderr.trim().slice(0, 500)}`);
  }
  const manifest = JSON.parse(result.stdout);
  return (manifest.manifests ?? [])
    .map((descriptor) => descriptor.digest)
    .filter((child) => DIGEST_PATTERN.test(child ?? ''));
}

async function findSharedChildDigests(digest, childDigests) {
  if (childDigests.length === 0) {
    return new Set();
  }
  const holders = await Deployment.find(
    {
      imageDigest: { $ne: digest },
      imageRef: { $ne: null },
      imageChildDigests: { $in: childDigests },
    },
    { imageChildDigests: 1 },
  ).lean();
  return new Set(
    holders.flatMap((holder) =>
      holder.imageChildDigests.filter((child) => childDigests.includes(child)),
    ),
  );
}

function createPackagesApi(repository, deps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ownerType = deps.packagesOwnerType ?? env.GHCR_PACKAGES_OWNER_TYPE;
  const tokenPath = deps.packagesTokenPath ?? env.GHCR_PACKAGES_TOKEN_PATH;
  const [, owner, ...packagePath] = repository.split('/');
  const versionsUrl = `${GITHUB_API}/${ownerType === 'user' ? 'users' : 'orgs'}/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packagePath.join('/'))}/versions`;
  const request = async (url, method = 'GET') => {
    const token = (await readFile(tokenPath, 'utf8')).trim();
    return fetchImpl(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'hellodeploy',
      },
    });
  };
  const failure = async (action, res) =>
    new Error(
      `GitHub Packages API ${action} failed: ${res.status} ${(await res.text()).slice(0, 300)}`,
    );

  const listVersions = async (page, perPage = VERSIONS_PER_PAGE) => {
    const res = await request(`${versionsUrl}?per_page=${perPage}&page=${page}`);
    if (!res.ok) {
      throw await failure('version listing', res);
    }
    return res.json();
  };
  return {
    listVersions,
    async findVersionIds(targets) {
      const found = new Map();
      for (let page = 1; page <= MAX_VERSION_PAGES && found.size < targets.size; page += 1) {
        const versions = await listVersions(page);
        for (const version of versions) {
          if (targets.has(version.name)) {
            found.set(version.name, version.id);
          }
        }
        if (versions.length < VERSIONS_PER_PAGE) {
          break;
        }
      }
      return found;
    },
    async deleteVersion(versionId) {
      const res = await request(`${versionsUrl}/${encodeURIComponent(versionId)}`, 'DELETE');
      // 404: another sweep deleted it first, which is the state cleanup wants.
      if (!res.ok && res.status !== 404) {
        throw await failure('version deletion', res);
      }
    },
  };
}
