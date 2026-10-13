#!/usr/bin/env node
/**
 * Pull-based production auto-deploy, run as root by hellodeploy-autodeploy.timer.
 *
 * Inbound connections cannot reach this host, so instead of GitHub pushing a
 * deploy, this checks GitHub: when `main` has moved ahead of the production
 * checkout and the CI workflow passed on that commit, it runs upgrade.sh for
 * it. upgrade.sh already backs up, drains the queue, verifies, and rolls back.
 * A commit whose upgrade failed is never retried automatically; the next
 * commit on `main` gets a fresh attempt.
 *
 *   sudo node scripts/autodeploy.js --dry-run   # every check, no upgrade
 */
import { execFile, spawn } from 'node:child_process';
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const AUTODEPLOY_DEFAULTS = Object.freeze({
  home: '/opt/hellodeploy',
  branch: 'main',
  workflowFile: 'ci.yml',
  tokenFile: '/etc/hellodeploy/autodeploy-github-token',
  stateFile: '/var/lib/hellodeploy/autodeploy-state.json',
  backupRoot: '/var/backups/hellodeploy',
  keepNewestBackups: 10,
  // Plus the first backup of each of the last 12 months, as monthly restore points.
  monthlyBackupMonths: 12,
  maxRememberedFailures: 20,
});

// upgrade.sh names each backup directory with `date +%Y%m%d_%H%M%S`.
const BACKUP_DIRECTORY_PATTERN = /^\d{8}_\d{6}$/;

/** `owner/repo` from an https or ssh GitHub remote URL, or null. */
export function parseGithubRepository(remoteUrl) {
  const match = String(remoteUrl)
    .trim()
    .match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Whether to deploy `remoteSha`. Pure: every input is already fetched.
 *
 * @param {{ currentSha: string, remoteSha: string, isAncestor: boolean,
 *   ciRun: { status: string, conclusion: string|null } | null,
 *   failedShas: string[] }} input
 * @returns {{ action: 'deploy' | 'skip', reason: string }}
 */
export function decideDeployment({ currentSha, remoteSha, isAncestor, ciRun, failedShas }) {
  if (currentSha === remoteSha) {
    return { action: 'skip', reason: 'Production already runs the latest commit.' };
  }
  if (!isAncestor) {
    // Someone deployed a ref that main does not contain; never move it backwards.
    return {
      action: 'skip',
      reason: 'Production is not behind main (a different ref was deployed manually).',
    };
  }
  if (failedShas.includes(remoteSha)) {
    return {
      action: 'skip',
      reason: 'This commit already failed to deploy; waiting for a newer commit.',
    };
  }
  if (!ciRun) {
    return { action: 'skip', reason: 'CI has not started for this commit yet.' };
  }
  if (ciRun.status !== 'completed') {
    return { action: 'skip', reason: `CI is ${ciRun.status}.` };
  }
  if (ciRun.conclusion !== 'success') {
    return { action: 'skip', reason: `CI finished with "${ciRun.conclusion}".` };
  }
  return { action: 'deploy', reason: 'CI passed on a newer commit.' };
}

/**
 * Backup directory names to delete. Keeps the newest `keepNewest`, plus the
 * oldest backup of each of the last `monthlyFor` calendar months (UTC,
 * counting the current one) as monthly restore points.
 */
export function selectBackupsToPrune(names, { keepNewest, monthlyFor, now }) {
  const backups = names.filter((name) => BACKUP_DIRECTORY_PATTERN.test(name)).sort();
  const keep = new Set(keepNewest > 0 ? backups.slice(-keepNewest) : []);

  const keptMonths = new Set();
  const current = now();
  for (let offset = 0; offset < monthlyFor; offset += 1) {
    const month = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - offset, 1));
    keptMonths.add(`${month.getUTCFullYear()}${String(month.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const monthsWithRestorePoint = new Set();
  for (const name of backups) {
    const month = name.slice(0, 6);
    if (keptMonths.has(month) && !monthsWithRestorePoint.has(month)) {
      monthsWithRestorePoint.add(month);
      keep.add(name);
    }
  }

  return backups.filter((name) => !keep.has(name)).reverse();
}

/**
 * One auto-deploy check. Every system boundary comes from `deps`.
 *
 * @returns {Promise<{ action: 'skip' | 'deployed' | 'failed', reason: string, sha?: string }>}
 */
export async function runAutodeploy(deps, config = AUTODEPLOY_DEFAULTS) {
  const state = await deps.readState();
  const currentSha = await deps.getCurrentSha();
  const remoteSha = await deps.fetchRemoteSha(config.branch);

  // Skip the GitHub API call on the common "nothing new" path.
  if (currentSha === remoteSha) {
    return decideDeployment({
      currentSha,
      remoteSha,
      isAncestor: true,
      ciRun: null,
      failedShas: [],
    });
  }

  const [isAncestor, ciRun] = await Promise.all([
    deps.isAncestor(currentSha, remoteSha),
    deps.getCiRun(remoteSha),
  ]);
  const decision = decideDeployment({
    currentSha,
    remoteSha,
    isAncestor,
    ciRun,
    failedShas: state.failedShas,
  });
  if (decision.action === 'skip') {
    return { ...decision, sha: remoteSha };
  }
  if (config.dryRun) {
    return { action: 'skip', reason: `Dry run: would deploy (${decision.reason})`, sha: remoteSha };
  }

  deps.log(`Deploying ${remoteSha} (production was ${currentSha}).`);
  const exitCode = await deps.runUpgrade(remoteSha);
  const attemptedAt = deps.now().toISOString();

  if (exitCode !== 0) {
    await deps.writeState({
      ...state,
      failedShas: [...state.failedShas, remoteSha].slice(-config.maxRememberedFailures),
      lastAttempt: { sha: remoteSha, outcome: 'failed', at: attemptedAt },
    });
    return {
      action: 'failed',
      reason: `upgrade.sh exited with ${exitCode}; it rolled back to the previous release if it could.`,
      sha: remoteSha,
    };
  }

  await deps.writeState({
    ...state,
    lastAttempt: { sha: remoteSha, outcome: 'deployed', at: attemptedAt },
  });
  const pruned = selectBackupsToPrune(await deps.listBackups(), {
    keepNewest: config.keepNewestBackups,
    monthlyFor: config.monthlyBackupMonths,
    now: deps.now,
  });
  for (const name of pruned) {
    await deps.removeBackup(name);
  }
  return {
    action: 'deployed',
    reason: `Deployed; removed ${pruned.length} old backup(s).`,
    sha: remoteSha,
  };
}

export function createSystemDeps(config) {
  const git = async (...args) => {
    const { stdout } = await execFileAsync('git', ['-C', config.home, ...args]);
    return stdout.trim();
  };

  return {
    log: (message) => console.log(`[autodeploy] ${message}`),
    now: () => new Date(),

    async readState() {
      try {
        const parsed = JSON.parse(await readFile(config.stateFile, 'utf8'));
        return { ...parsed, failedShas: Array.isArray(parsed.failedShas) ? parsed.failedShas : [] };
      } catch (error) {
        if (error.code === 'ENOENT') {
          return { failedShas: [] };
        }
        throw new Error(`Could not read ${config.stateFile}: ${error.message}`);
      }
    },
    async writeState(state) {
      await writeFile(config.stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    },

    getCurrentSha: () => git('rev-parse', 'HEAD'),
    async fetchRemoteSha(branch) {
      // Fetching objects touches only .git, never the working tree upgrade.sh checks.
      await git('fetch', '--quiet', 'origin', branch);
      return git('rev-parse', 'FETCH_HEAD');
    },
    async isAncestor(ancestor, descendant) {
      try {
        await git('merge-base', '--is-ancestor', ancestor, descendant);
        return true;
      } catch (error) {
        if (error.code === 1) {
          return false;
        }
        throw error;
      }
    },

    async getCiRun(sha) {
      const repository = parseGithubRepository(await git('remote', 'get-url', 'origin'));
      if (!repository) {
        throw new Error('The origin remote is not a GitHub repository.');
      }
      const token = (await readFile(config.tokenFile, 'utf8')).trim();
      const url =
        `https://api.github.com/repos/${repository}/actions/workflows/${config.workflowFile}/runs` +
        `?head_sha=${sha}&event=push&per_page=10`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`GitHub API answered ${response.status} for the CI run lookup.`);
      }
      const { workflow_runs: runs = [] } = await response.json();
      const latest = runs
        .filter((run) => run.head_branch === config.branch)
        .sort((a, b) => b.run_number - a.run_number)[0];
      return latest ? { status: latest.status, conclusion: latest.conclusion } : null;
    },

    async runUpgrade(sha) {
      // bash reads a script while running it and upgrade.sh checks out the new
      // release under itself, so run copies from outside the checkout.
      const workDir = await mkdtemp(join(tmpdir(), 'hellodeploy-autodeploy-'));
      try {
        for (const script of ['upgrade.sh', 'backup.sh']) {
          await copyFile(join(config.home, 'infrastructure', script), join(workDir, script));
        }
        return await new Promise((resolve, reject) => {
          const child = spawn('bash', [join(workDir, 'upgrade.sh'), '--ref', sha], {
            cwd: config.home,
            stdio: 'inherit',
          });
          child.on('error', reject);
          child.on('close', (code) => resolve(code ?? 1));
        });
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },

    listBackups: async () => {
      try {
        return await readdir(config.backupRoot);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },
    removeBackup: (name) => rm(join(config.backupRoot, name), { recursive: true, force: true }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = { ...AUTODEPLOY_DEFAULTS, dryRun: process.argv.includes('--dry-run') };
  const deps = createSystemDeps(config);
  try {
    const result = await runAutodeploy(deps, config);
    deps.log(
      `${result.action}${result.sha ? ` ${result.sha.slice(0, 12)}` : ''}: ${result.reason}`,
    );
    // A failed unit is the alert; checks that merely skipped exit cleanly.
    process.exitCode = result.action === 'failed' ? 1 : 0;
  } catch (error) {
    console.error(`[autodeploy] Check failed before deploying anything: ${error.message}`);
    process.exitCode = 1;
  }
}
