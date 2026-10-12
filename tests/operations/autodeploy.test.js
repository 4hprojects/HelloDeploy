import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  decideDeployment,
  parseGithubRepository,
  runAutodeploy,
  selectBackupsToPrune,
} from '../../scripts/autodeploy.js';

const service = await readFile(
  new URL('../../infrastructure/systemd/hellodeploy-autodeploy.service', import.meta.url),
  'utf8',
);
const installer = await readFile(
  new URL('../../infrastructure/install-autodeploy.sh', import.meta.url),
  'utf8',
);

const CURRENT = 'a'.repeat(40);
const NEXT = 'b'.repeat(40);
const PASSED = { status: 'completed', conclusion: 'success' };

const baseInput = {
  currentSha: CURRENT,
  remoteSha: NEXT,
  isAncestor: true,
  ciRun: PASSED,
  failedShas: [],
};

describe('autodeploy — decideDeployment', () => {
  it('deploys a newer commit whose CI passed', () => {
    assert.equal(decideDeployment(baseInput).action, 'deploy');
  });

  it('skips when production already runs the latest commit', () => {
    assert.equal(decideDeployment({ ...baseInput, remoteSha: CURRENT }).action, 'skip');
  });

  it('never moves production off a ref that main does not contain', () => {
    assert.match(decideDeployment({ ...baseInput, isAncestor: false }).reason, /not behind main/);
  });

  it('does not retry a commit that already failed to deploy', () => {
    assert.match(decideDeployment({ ...baseInput, failedShas: [NEXT] }).reason, /already failed/);
  });

  it('waits while CI has not started', () => {
    assert.equal(decideDeployment({ ...baseInput, ciRun: null }).action, 'skip');
  });

  it('waits while CI is still running', () => {
    const ciRun = { status: 'in_progress', conclusion: null };
    assert.match(decideDeployment({ ...baseInput, ciRun }).reason, /in_progress/);
  });

  it('skips a commit whose CI failed', () => {
    const ciRun = { status: 'completed', conclusion: 'failure' };
    assert.equal(decideDeployment({ ...baseInput, ciRun }).action, 'skip');
  });
});

describe('autodeploy — parseGithubRepository', () => {
  it('reads owner/repo from an https remote', () => {
    assert.equal(
      parseGithubRepository('https://github.com/4hprojects/HelloDeploy.git'),
      '4hprojects/HelloDeploy',
    );
  });

  it('reads owner/repo from an ssh remote', () => {
    assert.equal(
      parseGithubRepository('git@github.com:4hprojects/HelloDeploy.git'),
      '4hprojects/HelloDeploy',
    );
  });

  it('rejects a non-GitHub remote', () => {
    assert.equal(parseGithubRepository('https://gitlab.com/a/b.git'), null);
  });
});

describe('autodeploy — selectBackupsToPrune', () => {
  it('keeps the newest backups and ignores unrelated directories', () => {
    const names = ['20261001_120000', 'manual-keep', '20261003_090000', '20261002_100000'];
    assert.deepEqual(selectBackupsToPrune(names, 2), ['20261001_120000']);
  });
});

function makeDeps(overrides = {}) {
  const calls = { upgrades: [], states: [], removed: [] };
  const deps = {
    log: () => {},
    now: () => new Date('2026-10-13T00:00:00Z'),
    readState: async () => ({ failedShas: [] }),
    writeState: async (state) => calls.states.push(state),
    getCurrentSha: async () => CURRENT,
    fetchRemoteSha: async () => NEXT,
    isAncestor: async () => true,
    getCiRun: async () => PASSED,
    runUpgrade: async (sha) => {
      calls.upgrades.push(sha);
      return 0;
    },
    listBackups: async () => [],
    removeBackup: async (name) => calls.removed.push(name),
    ...overrides,
  };
  return { deps, calls };
}

const config = { branch: 'main', keepBackups: 1, maxRememberedFailures: 2 };

describe('autodeploy — runAutodeploy', () => {
  it('runs upgrade.sh for the new commit', async () => {
    const { deps, calls } = makeDeps();
    await runAutodeploy(deps, config);
    assert.deepEqual(calls.upgrades, [NEXT]);
  });

  it('does not ask GitHub for CI status when nothing changed', async () => {
    let ciLookups = 0;
    const { deps } = makeDeps({
      fetchRemoteSha: async () => CURRENT,
      getCiRun: async () => {
        ciLookups += 1;
        return PASSED;
      },
    });
    await runAutodeploy(deps, config);
    assert.equal(ciLookups, 0);
  });

  it('never runs upgrade.sh in a dry run', async () => {
    const { deps, calls } = makeDeps();
    await runAutodeploy(deps, { ...config, dryRun: true });
    assert.deepEqual(calls.upgrades, []);
  });

  it('does not run upgrade.sh while CI is pending', async () => {
    const { deps, calls } = makeDeps({
      getCiRun: async () => ({ status: 'queued', conclusion: null }),
    });
    await runAutodeploy(deps, config);
    assert.deepEqual(calls.upgrades, []);
  });

  it('remembers a failed commit so it is not retried', async () => {
    const { deps, calls } = makeDeps({ runUpgrade: async () => 1 });
    await runAutodeploy(deps, config);
    assert.deepEqual(calls.states[0].failedShas, [NEXT]);
  });

  it('reports a failed upgrade so the systemd unit fails', async () => {
    const { deps } = makeDeps({ runUpgrade: async () => 1 });
    const result = await runAutodeploy(deps, config);
    assert.equal(result.action, 'failed');
  });

  it('caps how many failed commits it remembers', async () => {
    const { deps, calls } = makeDeps({
      readState: async () => ({ failedShas: ['c'.repeat(40), 'd'.repeat(40)] }),
      runUpgrade: async () => 1,
    });
    await runAutodeploy(deps, config);
    assert.deepEqual(calls.states[0].failedShas, ['d'.repeat(40), NEXT]);
  });

  it('prunes old backups only after a successful deploy', async () => {
    const { deps, calls } = makeDeps({
      listBackups: async () => ['20261001_120000', '20261002_120000'],
    });
    await runAutodeploy(deps, config);
    assert.deepEqual(calls.removed, ['20261001_120000']);
  });

  it('keeps every backup when the upgrade failed', async () => {
    const { deps, calls } = makeDeps({
      runUpgrade: async () => 1,
      listBackups: async () => ['20261001_120000', '20261002_120000'],
    });
    await runAutodeploy(deps, config);
    assert.deepEqual(calls.removed, []);
  });
});

describe('autodeploy — host integration files', () => {
  it('lets an operator pause auto-deploy with a flag file', () => {
    assert.match(service, /ConditionPathExists=!\/etc\/hellodeploy\/autodeploy\.disabled/);
  });

  it('pins the published GitHub host key instead of trusting the first one seen', () => {
    assert.match(installer, /SHA256:\+DiY3wvvV6TuJJhbpZisF\/zLDA0zPMSvHdkr4UvCOqU/);
  });

  it('keeps the CI token out of the process list', () => {
    assert.match(installer, /-H @"\$WORK_DIR\/auth-header"/);
  });
});
