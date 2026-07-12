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
});
