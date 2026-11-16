import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const scriptPath = new URL('../../infrastructure/backup-offsite.sh', import.meta.url).pathname;
const installerPath = new URL('../../infrastructure/install-backup.sh', import.meta.url).pathname;
const script = await readFile(scriptPath, 'utf8');
const installer = await readFile(installerPath, 'utf8');
const timer = await readFile(
  new URL('../../infrastructure/systemd/hellodeploy-backup.timer', import.meta.url),
  'utf8',
);

describe('off-host backup', () => {
  it('is valid bash', () => {
    const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('refuses any rclone remote that is not a crypt remote', () => {
    assert.match(script, /if \[\[ "\$remote_type" != "crypt" \]\]/);
  });

  it('checks the remote is encrypted before uploading', () => {
    assert.ok(script.indexOf('!= "crypt"') < script.indexOf('rclone copyto'));
  });

  it('prunes old uploads only after the new upload succeeds', () => {
    assert.ok(script.indexOf('rclone copyto') < script.indexOf('rclone delete'));
  });

  it('prunes local backups only after the new upload succeeds', () => {
    assert.ok(script.indexOf('rclone copyto') < script.indexOf('find "$BACKUP_ROOT"'));
  });

  it('parses its configuration instead of sourcing it as root', () => {
    assert.doesNotMatch(script, /^\s*(source|\.)\s+"?\$CONFIG_FILE/m);
  });

  it('includes the host configuration that backup.sh leaves out', () => {
    assert.match(script, /for dir in hellodeploy cloudflared/);
  });

  it('runs again after boot when the host was off at the scheduled time', () => {
    assert.match(timer, /^Persistent=true$/m);
  });
});

describe('off-host backup installer', () => {
  it('is valid bash', () => {
    const result = spawnSync('bash', ['-n', installerPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('enables the timer only after a first backup succeeds', () => {
    assert.ok(
      installer.indexOf('systemctl start hellodeploy-backup.service') <
        installer.indexOf('systemctl enable --now hellodeploy-backup.timer'),
    );
  });
});
