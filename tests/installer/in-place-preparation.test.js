import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const installer = await readFile(
  new URL('../../infrastructure/install.sh', import.meta.url),
  'utf8',
);

describe('in-place pilot installation preparation', () => {
  it('requires independent backup and rollback evidence on Ubuntu 26.04', () => {
    assert.match(installer, /HELLODEPLOY_PILOT_BACKUP_VERIFIED:-false/);
    assert.match(installer, /HELLODEPLOY_ROLLBACK_BASELINE_VERIFIED:-false/);
    assert.match(installer, /separately verified pilot backup and rollback baseline/);
  });

  it('requires a private reviewed configuration before preparation', () => {
    assert.match(installer, /Preparation mode requires HELLODEPLOY_CONFIG_SOURCE/);
    assert.match(installer, /CONFIG_SOURCE_MODE=.*stat -c/);
    assert.match(installer, /must be root-owned and deny group and other access/);
    assert.match(installer, /parent must be root-owned and not group or other writable/);
    assert.match(installer, /must be a private regular file, not a symlink/);
    assert.match(installer, /must remain outside the installation checkout/);
  });

  it('copies reviewed configuration without secret generation or setup mutation', () => {
    const sourceBranch = installer.indexOf('if [[ -n "$CONFIG_SOURCE" ]]');
    const existingBranch = installer.indexOf('elif [[ -f "$ENV_FILE" ]]', sourceBranch);
    assert.ok(sourceBranch > 0 && existingBranch > sourceBranch);
    const branch = installer.slice(sourceBranch, existingBranch);
    assert.match(branch, /install -m 0640 -o root -g/);
    assert.doesNotMatch(branch, /generate-secrets|scripts\/setup\.js/);
    assert.match(
      installer,
      /if \[\[ -z "\$CONFIG_SOURCE" \]\]; then\s+info "Launching setup wizard/,
    );
  });

  it('leaves ingress and all HelloDeploy services untouched in preparation mode', () => {
    assert.match(installer, /refuses to replace an active or enabled HelloDeploy service/);
    assert.match(installer, /systemctl is-enabled --quiet/);
    assert.match(installer, /Preparation mode: global Nginx includes remain unchanged/);
    assert.match(installer, /Preparation mode: platform ingress remains unchanged/);
    const prepareExit = installer.indexOf('Preparation mode complete');
    const activation = installer.indexOf('systemctl enable --now');
    const verification = installer.indexOf('bash infrastructure/verify-installation.sh');
    assert.ok(prepareExit > 0 && prepareExit < activation && prepareExit < verification);
    assert.match(installer, /services remain disabled and stopped/);
  });
});
