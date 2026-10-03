import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/deploy-production.yml', import.meta.url),
  'utf8',
);
const forcedCommand = await readFile(
  new URL('../../infrastructure/release-command.sh', import.meta.url),
  'utf8',
);
const rootWrapper = await readFile(
  new URL('../../infrastructure/run-platform-upgrade.sh', import.meta.url),
  'utf8',
);
const installer = await readFile(
  new URL('../../infrastructure/install-release-automation.sh', import.meta.url),
  'utf8',
);
const upgrade = await readFile(new URL('../../infrastructure/upgrade.sh', import.meta.url), 'utf8');
const verifier = await readFile(
  new URL('../../infrastructure/verify-installation.sh', import.meta.url),
  'utf8',
);
const adminRoutes = await readFile(
  new URL('../../apps/web/src/routes/pages/admin.routes.js', import.meta.url),
  'utf8',
);
const serverView = await readFile(
  new URL('../../apps/web/src/views/pages/admin/server.ejs', import.meta.url),
  'utf8',
);
const browser = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');
const releaseService = await readFile(
  new URL('../../apps/web/src/services/platform-release.service.js', import.meta.url),
  'utf8',
);
const ciWorkflow = await readFile(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const codeqlWorkflow = await readFile(
  new URL('../../.github/workflows/codeql.yml', import.meta.url),
  'utf8',
);

describe('one-click platform release contract', () => {
  it('limits the admin mutation to Super Admins and keeps CSRF in the form', () => {
    assert.match(adminRoutes, /router\.post\('\/server\/releases', requireSuperAdmin/);
    assert.match(serverView, /partials\/csrf-field/);
    assert.match(serverView, /Deploy latest release/);
    assert.match(serverView, /Deploy exact commit <%= releases\.candidate\.sha %>/);
    assert.match(serverView, /briefly restart/);
  });

  it('polls active release requests and exposes workflow history', () => {
    assert.match(serverView, /data-platform-release-status-url/);
    assert.match(serverView, /Recent requests/);
    assert.match(browser, /initPlatformReleasePolling/);
    assert.match(browser, /window\.setTimeout\(poll, 5000\)/);
  });

  it('uses a protected workflow with exact SHA checks and pinned SSH host verification', () => {
    assert.match(workflow, /environment: production/);
    assert.match(workflow, /\^\[a-f0-9\]\{40\}\$/);
    assert.match(workflow, /RELEASE_SHA: \$\{\{ inputs\.release_sha \}\}/);
    assert.doesNotMatch(workflow, /\[\[ '\$\{\{ inputs\.release_sha/);
    assert.match(workflow, /branch: 'main'/);
    assert.match(workflow, /Lint & Test \(22\.x\)/);
    assert.match(workflow, /CodeQL Analysis \(javascript-typescript\)/);
    assert.match(workflow, /completed_at/);
    assert.match(workflow, /latest\?\.conclusion !== 'success'/);
    assert.match(workflow, /StrictHostKeyChecking=yes/);
    assert.doesNotMatch(workflow, /StrictHostKeyChecking=no/);
    assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
    assert.match(workflow, /actions\/github-script@[a-f0-9]{40}/);
  });

  it('keeps release qualification aligned with the emitted CI and CodeQL check names', () => {
    assert.match(releaseService, /Lint & Test \(22\.x\)/);
    assert.match(releaseService, /CodeQL Analysis \(javascript-typescript\)/);
    assert.match(releaseService, /check\.status === 'completed'/);
    assert.match(releaseService, /check-runs\?filter=all&per_page=100/);
    assert.match(ciWorkflow, /name: Lint & Test/);
    assert.match(ciWorkflow, /node-version: \[22\.x\]/);
    assert.match(codeqlWorkflow, /name: CodeQL Analysis/);
    assert.match(codeqlWorkflow, /language: \['javascript-typescript'\]/);
  });

  it('installs a no-shell forced command and validates both wrapper arguments', () => {
    assert.match(installer, /useradd --system/);
    assert.match(installer, /usermod --shell \/bin\/sh/);
    assert.match(installer, /passwd --lock/);
    assert.match(installer, /restrict,command=/);
    assert.match(installer, /visudo -cf/);
    assert.match(forcedCommand, /SSH_ORIGINAL_COMMAND/);
    assert.match(forcedCommand, /\[a-f0-9\]\{40\}[\s\S]*\[a-f0-9\]\{24\}/);
    assert.match(rootWrapper, /EUID -ne 0/);
    assert.match(rootWrapper, /\/opt\/hellodeploy\/infrastructure\/upgrade\.sh --ref/);
    assert.match(verifier, /release SSH key is restricted to the forced command/);
    assert.match(verifier, /web can read the protected platform release token/);
  });

  it('rejects malformed forced commands before invoking sudo', () => {
    for (const command of [
      'deploy main bad',
      `deploy ${'a'.repeat(40)} ${'b'.repeat(24)} extra`,
      `deploy  ${'a'.repeat(40)} ${'b'.repeat(24)}`,
      `deploy ${'a'.repeat(40)} ${'b'.repeat(24)}\nunexpected`,
    ]) {
      const result = spawnSync('bash', ['infrastructure/release-command.sh'], {
        cwd: new URL('../..', import.meta.url),
        env: { ...process.env, SSH_ORIGINAL_COMMAND: command },
        encoding: 'utf8',
      });
      assert.equal(result.status, 64);
      assert.match(result.stderr, /Invalid platform release command/);
    }
  });

  it('distinguishes verified rollback from critical rollback failure', () => {
    assert.match(upgrade, /Rollback verified[\s\S]*exit 20/);
    assert.match(upgrade, /CRITICAL: rollback[\s\S]*exit 21/);
    assert.match(workflow, /20\).*ROLLED_BACK/);
    assert.match(workflow, /21\).*FAILED/);
  });
});
