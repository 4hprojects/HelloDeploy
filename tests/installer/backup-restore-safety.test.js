import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const backup = await readFile(new URL('../../infrastructure/backup.sh', import.meta.url), 'utf8');
const restore = await readFile(new URL('../../infrastructure/restore.sh', import.meta.url), 'utf8');

describe('backup and restore safety', () => {
  it('requires explicit acknowledgement before omitting the database', () => {
    assert.match(backup, /--skip-database/);
    assert.match(backup, /mongodump failed; backup is incomplete/);
    assert.match(backup, /DATABASE_MODE="external"/);
  });

  it('backs up routing state and emits integrity metadata', () => {
    assert.match(backup, /nginx-routes\.tar\.gz/);
    assert.match(backup, /hellodeploy-platform\.conf/);
    assert.match(backup, /CHECKSUMS\.sha256/);
    assert.match(backup, /manifest\.json/);
    assert.match(backup, /commitSha/);
  });

  it('verifies checksums before prompting or changing the host', () => {
    const checksum = restore.indexOf('sha256sum --check --strict');
    const prompt = restore.indexOf('Continue? [y/N]');
    const stop = restore.indexOf('systemctl stop');
    assert.ok(checksum > 0 && checksum < prompt && checksum < stop);
  });

  it('treats database restore failure as fatal and validates Nginx before restart', () => {
    assert.match(restore, /mongorestore failed; services will remain stopped/);
    assert.ok(restore.indexOf('nginx -t') < restore.indexOf('systemctl start'));
  });
});
