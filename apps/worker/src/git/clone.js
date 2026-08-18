import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { logger } from '@hellodeploy/observability';
import { normalizePublicGithubRepositoryUrl } from '@hellodeploy/contracts';

const GIT_TIMEOUT_MS = 120_000;
const GIT_OUTPUT_MAX_BYTES = 1_000_000;
const TARBALL_DOWNLOAD_TIMEOUT_MS = 180_000;
const TARBALL_MAX_BYTES = 200_000_000;
const ISOLATED_GIT_ENV = {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'credential.helper',
  GIT_CONFIG_VALUE_0: '',
};

// ─── Git runner ────────────────────────────────────────────────────────────────

/**
 * Run a git command as a child process.
 * SECURITY: Always uses command arrays — never shell string interpolation.
 *
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string,string> }} opts
 * @returns {Promise<string>} combined stdout
 */
function runGit(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        ...ISOLATED_GIT_ENV,
        ...opts.env,
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const out = [];
    const err = [];
    let outputBytes = 0;
    let limitExceeded = false;
    let timedOut = false;
    const collect = (target) => (data) => {
      outputBytes += data.length;
      if (outputBytes > GIT_OUTPUT_MAX_BYTES) {
        limitExceeded = true;
        proc.kill('SIGKILL');
        return;
      }
      target.push(data);
    };
    proc.stdout.on('data', collect(out));
    proc.stderr.on('data', collect(err));
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, GIT_TIMEOUT_MS);
    timeout.unref();

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error('git operation timed out'));
        return;
      }
      if (limitExceeded) {
        reject(new Error('git output limit exceeded'));
        return;
      }
      if (code === 0) {
        resolve(Buffer.concat(out).toString('utf8').trim());
      } else {
        // Never include the stdout/stderr verbatim — it may contain the token URL
        reject(new Error(`git exited with code ${code}`));
      }
    });

    proc.on('error', (err2) => reject(new Error(`git spawn error: ${err2.message}`)));
  });
}

// ─── Clone exact commit ────────────────────────────────────────────────────────

/**
 * Clone a specific commit SHA from a private GitHub repository.
 * Uses the short-lived installation token in the HTTPS URL.
 * The token is NEVER logged — only a redacted URL appears in logs.
 *
 * @param {{
 *   installationToken: string,  // short-lived; never logged
 *   ownerLogin: string,
 *   repoName: string,
 *   commitSha: string,
 *   workDir: string,            // must not exist yet
 * }} params
 */
export async function cloneExactCommit({
  installationToken,
  ownerLogin,
  repoName,
  commitSha,
  workDir,
}) {
  await mkdir(workDir, { recursive: true });

  const cloneUrl = `https://x-access-token:${installationToken}@github.com/${ownerLogin}/${repoName}.git`;
  const logUrl = `https://x-access-token:[REDACTED]@github.com/${ownerLogin}/${repoName}.git`;

  logger.info('Git: initializing clone', { url: logUrl, sha: commitSha.slice(0, 7), workDir });

  // init → add remote → fetch single commit → checkout
  await runGit(['init', workDir]);
  await runGit(['remote', 'add', 'origin', cloneUrl], { cwd: workDir });

  try {
    // Shallow fetch of the exact commit — avoids downloading the full history
    await runGit(['fetch', '--depth', '1', 'origin', commitSha], { cwd: workDir });
  } catch {
    // Fall back to fetching the default branch if the SHA is not directly fetchable
    // (some GitHub plans/setups don't support fetching by SHA)
    await runGit(['fetch', '--depth', '50', 'origin'], { cwd: workDir });
  }

  await runGit(['checkout', commitSha], { cwd: workDir });

  // Remove the remote immediately — the token URL is no longer needed
  await runGit(['remote', 'remove', 'origin'], { cwd: workDir });

  // Remove .git directory — we only need the working tree for the build context
  await rm(`${workDir}/.git`, { recursive: true, force: true });

  logger.info('Git: clone complete', { sha: commitSha.slice(0, 7), workDir });
}

/**
 * Pipe a source stream (optionally through intermediate transforms) into
 * `tar`, extracting into workDir and stripping the single top-level
 * wrapper directory GitHub's archive endpoint always includes.
 * SECURITY: tar invoked with a fixed argument array, no shell interpolation.
 *
 * @param {NodeJS.ReadableStream[]} streamChain - source stream, then any
 *   transforms to pipe it through before it reaches tar's stdin
 * @param {string} workDir
 * @returns {Promise<void>}
 */
function extractTarballStream(streamChain, workDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', '-', '--strip-components=1', '-C', workDir], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    let settled = false;
    const settle = (fn, value) => {
      if (!settled) {
        settled = true;
        fn(value);
      }
    };

    proc.stderr.on('data', () => {});
    proc.on('close', (code) => {
      if (code === 0) {
        settle(resolve);
      } else {
        // Never include stderr verbatim in the thrown error — kept out of
        // logs/failureSummary consistently with runGit's own convention.
        settle(reject, new Error(`tar exited with code ${code}`));
      }
    });
    proc.on('error', (err2) => settle(reject, new Error(`tar spawn error: ${err2.message}`)));

    // A single pipeline() across the whole chain (source → transforms →
    // tar's stdin) so an error or early exit anywhere properly destroys
    // every stage instead of leaking an unconsumed fetch response body.
    pipeline(...streamChain, proc.stdin).catch((pipelineErr) => {
      // Already reflected by proc's own 'close'/'error' handlers above when
      // it's a tar-side failure (EPIPE, early exit) — this catch exists so
      // an upstream failure (e.g. the byte-limit transform erroring) is
      // still surfaced, and so nothing becomes an unhandled rejection.
      settle(reject, pipelineErr);
    });
  });
}

/**
 * A counting passthrough that errors once a byte budget is exceeded —
 * enforced independently of the `Content-Length` header, which isn't
 * always present or trustworthy. The error propagates through pipeline()
 * in extractTarballStream, which cleans up every stage of the chain.
 */
function createByteLimiter(maxBytes) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new Error('Repository archive exceeds the size limit.'));
        return;
      }
      callback(null, chunk);
    },
  });
}

/** Clone an exact commit from an allowlisted public GitHub repository. */
export async function clonePublicExactCommit({
  ownerLogin,
  repoName,
  commitSha,
  workDir,
  maxBytes = TARBALL_MAX_BYTES,
  downloadTimeoutMs = TARBALL_DOWNLOAD_TIMEOUT_MS,
}) {
  let source;
  try {
    source = normalizePublicGithubRepositoryUrl(`https://github.com/${ownerLogin}/${repoName}`);
  } catch {
    throw new Error('Invalid public repository clone parameters.');
  }
  if (
    source.ownerLogin !== ownerLogin ||
    source.name !== repoName ||
    !/^[a-f0-9]{40}$/.test(commitSha)
  ) {
    throw new Error('Invalid public repository clone parameters.');
  }

  await mkdir(workDir, { recursive: true });

  // Downloads a tarball of the exact commit rather than using `git fetch`.
  // WHY: git's smart-HTTP pack transfer (an HTTP response piped into a
  // separate `git index-pack` process) proved unreliable on a production
  // host's network — reproducibly stalling indefinitely even though plain
  // HTTP downloads of the same content transferred fine. The working tree
  // only ever needs file contents at one commit — `.git` was already being
  // deleted immediately after cloning — so nothing is lost by using
  // GitHub's archive endpoint instead.
  // SECURITY TRADEOFF: unlike `git fetch`, which independently verifies
  // fetched objects against their expected hash, this relies entirely on
  // TLS to protect the transfer in transit — there's no client-side
  // verification that the tarball GitHub serves for this URL genuinely
  // corresponds to `commitSha`. Not a materially different trust boundary
  // in practice (GitHub is already fully trusted either way), but it's a
  // real property being traded away for reliability, worth keeping in mind.
  const tarballUrl = `https://codeload.github.com/${ownerLogin}/${repoName}/tar.gz/${commitSha}`;

  logger.info('Clone: downloading public repository archive', {
    repository: `${ownerLogin}/${repoName}`,
    sha: commitSha.slice(0, 7),
    workDir,
  });

  const response = await fetch(tarballUrl, {
    signal: AbortSignal.timeout(downloadTimeoutMs),
    redirect: 'follow',
  });
  if (!response.ok || !response.body) {
    throw new Error(`Archive download failed: HTTP ${response.status}`);
  }

  const bodyStream = Readable.fromWeb(response.body);
  const limiter = createByteLimiter(maxBytes);
  await extractTarballStream([bodyStream, limiter], workDir);

  logger.info('Clone: public repository extracted', { sha: commitSha.slice(0, 7), workDir });
}
