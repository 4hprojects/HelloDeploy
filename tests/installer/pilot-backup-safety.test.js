import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const backup = await readFile(
  new URL('../../infrastructure/backup-pilot.sh', import.meta.url),
  'utf8',
);
const verify = await readFile(
  new URL('../../infrastructure/verify-pilot-backup.sh', import.meta.url),
  'utf8',
);

describe('pre-cutover pilot backup safety', () => {
  it('requires clean immutable state and explicit external database evidence', () => {
    assert.match(backup, /--external-database-snapshot-confirmed/);
    assert.match(backup, /--rollback-instructions/);
    assert.match(backup, /status --porcelain --untracked-files=normal/);
    assert.match(backup, /rev-parse --verify HEAD\^\{commit\}/);
    assert.match(backup, /-c safe\.directory="\$REPO_DIR" -C "\$REPO_DIR"/);
    assert.match(backup, /\^\[0-9a-f\]\{40\}\$/);
  });

  it('captures the current pilot configuration without printing secret-bearing paths', () => {
    assert.match(backup, /\.env.*payload\/environment/);
    assert.match(backup, /dashboard-nginx\.conf/);
    assert.match(backup, /tunnel-credentials/);
    assert.match(backup, /payload\/rollback-instructions/);
    assert.match(backup, /Rollback instructions must be a root-owned private regular file/);
    assert.doesNotMatch(backup, /info .*TUNNEL_CREDENTIAL/);
  });

  it('encrypts to an existing recipient and always removes plaintext staging', () => {
    assert.match(backup, /gpg --batch --list-keys/);
    assert.match(backup, /--recipient "\$GPG_RECIPIENT"/);
    assert.match(backup, /trap cleanup EXIT INT TERM HUP/);
    assert.match(backup, /rm -rf "\$STAGING_DIR"/);
    assert.match(backup, /Refusing to overwrite/);
    assert.match(backup, /protected output directory must deny group and other access/);
    assert.match(backup, /protected output directory must be owned by root/);
    assert.doesNotMatch(backup, /chmod 700 "\$OUTPUT_PARENT"/);
    assert.match(backup, /exact 40-character fingerprint/);
    assert.match(backup, /Same-host verification does not satisfy the cross-host restore gate/);
  });

  it('verifies safe archive paths, checksums, and the bounded manifest before restore', () => {
    const extraction = verify.indexOf('tar --no-same-owner');
    assert.ok(verify.indexOf('tar -tzf') < extraction);
    assert.match(verify, /unexpected, duplicate, or unsafe member/);
    assert.match(verify, /allowed\["payload\/environment"\]/);
    assert.match(verify, /required\["payload\/rollback-instructions"\]/);
    assert.match(verify, /backup checksum inventory is unsafe/);
    assert.match(verify, /Pilot backup release identity is inconsistent/);
    assert.match(verify, /Pilot backup data inventory is inconsistent/);
    assert.match(verify, /--no-same-owner --no-same-permissions/);
    assert.ok(verify.indexOf('sha256sum --check --strict') > extraction);
    assert.match(verify, /hellodeploy-pilot-pre-cutover/);
    assert.doesNotMatch(verify, /systemctl|nginx -t|cp .*\/etc/);
    assert.doesNotMatch(backup + verify, /node --input-type/);
  });
});
