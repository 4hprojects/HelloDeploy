import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { logger } from '@hellodeploy/observability';

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
      env: { ...process.env, ...opts.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const out = [];
    const err = [];
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => err.push(d));

    proc.on('close', (code) => {
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
