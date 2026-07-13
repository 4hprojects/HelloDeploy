import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const script = await readFile(new URL('../../infrastructure/upgrade.sh', import.meta.url), 'utf8');

describe('upgrade safety policy', () => {
  it('requires an explicit immutable release reference', () => {
    assert.match(script, /HELLODEPLOY_RELEASE_REF/);
    assert.match(script, /--ref/);
    assert.match(script, /rev-parse --verify "\$\{RELEASE_REF\}\^\{commit\}"/);
    assert.match(script, /git checkout --detach "\$NEW_COMMIT"/);
    assert.doesNotMatch(script, /git pull/);
  });

  it('refuses to upgrade a dirty checkout before backup or checkout', () => {
    const dirtyGuard = script.indexOf('git status --porcelain');
    const backup = script.indexOf('Pre-upgrade backup');
    const checkout = script.indexOf('git checkout --detach "$NEW_COMMIT"');
    assert.ok(dirtyGuard > 0 && dirtyGuard < backup && dirtyGuard < checkout);
  });

  it('records and restores the full previous commit', () => {
    assert.match(script, /PREV_COMMIT=\$\(git rev-parse --verify HEAD\)/);
    assert.match(script, /rollback_release "\$PREV_COMMIT"/);
    assert.match(script, /git checkout --detach "\$previous_commit"/);
  });

  it('requires an explicit external database mode before skipping mongodump', () => {
    assert.match(script, /HELLODEPLOY_DATABASE_BACKUP_MODE:-local/);
    assert.match(script, /BACKUP_ARGS\+=\(--skip-database\)/);
  });

  it('restores release artifacts and verifies a failed-upgrade rollback', () => {
    const rollback = script.slice(
      script.indexOf('rollback_release()'),
      script.indexOf('if [[ $EUID'),
    );
    assert.match(rollback, /activate_checked_out_release/);
    assert.match(script, /npm ci --omit=dev \|\| return 1/);
    assert.match(script, /validate-config\.js --component web --require-production \|\| return 1/);
    assert.match(
      script,
      /validate-config\.js --component worker --require-production \|\| return 1/,
    );
    assert.match(script, /install_service_units \|\| return 1/);
    assert.match(script, /configure-platform-ingress\.sh[\s\S]*\|\| return 1/);
    assert.match(script, /systemctl restart[\s\S]*\|\| return 1/);
    assert.match(script, /Rollback verified at \$PREV_COMMIT/);
    assert.match(script, /CRITICAL: rollback to \$PREV_COMMIT failed verification/);
  });

  it('uses the same readiness verifier for the new and restored releases', () => {
    assert.match(script, /verify_release\(\)/);
    assert.equal(script.match(/verify_release/g)?.length, 2);
    assert.match(script, /bash infrastructure\/verify-installation\.sh/);
  });

  it('always activates and verifies the complete V1 service set', () => {
    assert.doesNotMatch(script, /HELLODEPLOY_HOST_ROLE/);
    assert.doesNotMatch(script, /HELLODEPLOY_VERIFY_ROLE/);
    assert.match(
      script,
      /local services=\(hellodeploy-nginx-helper hellodeploy-worker hellodeploy-web\)/,
    );
    assert.match(script, /validate-config\.js --component web --require-production/);
    assert.match(script, /validate-config\.js --component worker --require-production/);
  });

  it('guards every candidate activation failure with automatic rollback', () => {
    const activationCall = script.indexOf('if ! activate_checked_out_release; then');
    const rollbackCall = script.indexOf('rollback_release "$PREV_COMMIT"', activationCall);
    assert.ok(activationCall > 0 && rollbackCall > activationCall);
    assert.match(
      script,
      /candidate release failed installation, configuration, restart, or verification/,
    );
  });

  it('pauses and drains deployments before checkout and restores prior queue state', () => {
    const pause = script.indexOf('queue-maintenance.js pause-and-drain');
    const checkout = script.indexOf('git checkout --detach "$NEW_COMMIT"');
    assert.ok(pause > 0 && pause < checkout);
    assert.match(script, /trap cleanup_upgrade_state EXIT/);
    assert.match(script, /queue-maintenance\.js resume --state-file/);
    assert.match(script, /KEEP_QUEUE_PAUSED=true/);
    assert.match(script, /queue remains paused because rollback verification failed/);
  });
});
