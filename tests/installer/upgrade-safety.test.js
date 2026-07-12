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
    assert.match(script, /git checkout --detach "\$PREV_COMMIT"/);
  });

  it('requires an explicit external database mode before skipping mongodump', () => {
    assert.match(script, /HELLODEPLOY_DATABASE_BACKUP_MODE:-local/);
    assert.match(script, /BACKUP_ARGS\+=\(--skip-database\)/);
  });
});
