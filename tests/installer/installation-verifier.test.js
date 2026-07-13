import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const verifier = await readFile(
  new URL('../../infrastructure/verify-installation.sh', import.meta.url),
  'utf8',
);
const installer = await readFile(
  new URL('../../infrastructure/install.sh', import.meta.url),
  'utf8',
);
const upgrade = await readFile(new URL('../../infrastructure/upgrade.sh', import.meta.url), 'utf8');

describe('installed-host verification wiring', () => {
  it('checks service identities and least-privilege groups', () => {
    assert.match(verifier, /id -nG hellodeploy-web/);
    assert.match(verifier, /id -nG hellodeploy-worker/);
    assert.match(verifier, /docker/);
    assert.match(verifier, /hellodeploy-nginx/);
  });

  it('checks protected configuration, route directory, and helper socket metadata', () => {
    assert.match(verifier, /root:hellodeploy-config:640/);
    assert.match(verifier, /root:root:755/);
    assert.match(verifier, /root:hellodeploy-nginx:660/);
  });

  it('checks services, Nginx configuration, and dependency readiness', () => {
    assert.match(verifier, /systemctl is-active/);
    assert.match(verifier, /nginx -t/);
    assert.match(verifier, /\/ready/);
  });

  it('runs after installation and upgrade and upgrade no longer accepts liveness alone', () => {
    assert.match(installer, /bash infrastructure\/verify-installation\.sh/);
    assert.match(upgrade, /bash infrastructure\/verify-installation\.sh/);
    assert.match(upgrade, /\/ready/);
    assert.doesNotMatch(upgrade, /\/health/);
  });

  it('requires production-mode validation during install and upgrade', () => {
    for (const script of [installer, upgrade]) {
      assert.match(script, /--component web --require-production/);
      assert.match(script, /--component worker --require-production/);
    }
  });

  it('installs and verifies only the complete V1 platform role', () => {
    for (const script of [installer, upgrade]) {
      assert.doesNotMatch(script, /HELLODEPLOY_HOST_ROLE/);
      assert.doesNotMatch(script, /HELLODEPLOY_VERIFY_ROLE/);
      assert.doesNotMatch(script, /worker-only/i);
    }
    assert.match(installer, /hellodeploy-web\.service/);
    assert.match(installer, /hellodeploy-worker\.service/);
    assert.match(installer, /hellodeploy-nginx-helper\.service/);
    assert.match(verifier, /check_user hellodeploy-web/);
    assert.match(verifier, /check_user hellodeploy-worker/);
  });

  it('installs only an explicitly resolved immutable release', () => {
    assert.match(installer, /HELLODEPLOY_RELEASE_REF/);
    assert.match(installer, /git -C "\$HD_HOME" fetch --depth 1 origin "\$RELEASE_REF"/);
    assert.match(installer, /rev-parse --verify 'FETCH_HEAD\^\{commit\}'/);
    assert.match(installer, /checkout --detach "\$RELEASE_COMMIT"/);
    assert.doesNotMatch(installer, /git clone --branch/);
  });

  it('configures both service identities from the protected platform environment', () => {
    assert.doesNotMatch(installer, /HELLODEPLOY_CONFIG_SOURCE/);
    assert.match(installer, /chown root:"\$HD_CONFIG_GROUP" "\$ENV_FILE"/);
    assert.match(installer, /chmod 640 "\$ENV_FILE"/);
    assert.match(installer, /sudo -u "\$HD_WEB_USER" node scripts\/validate-config\.js/);
    assert.match(installer, /sudo -u "\$HD_WORKER_USER" node scripts\/validate-config\.js/);
  });
});
