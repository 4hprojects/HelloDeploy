import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const verifier = await readFile(
  new URL('../../infrastructure/verify-prepared-installation.sh', import.meta.url),
  'utf8',
);
const installer = await readFile(
  new URL('../../infrastructure/install.sh', import.meta.url),
  'utf8',
);

describe('inactive prepared-installation verifier', () => {
  it('requires and compares one full immutable release commit', () => {
    assert.match(verifier, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT/);
    assert.match(verifier, /\^\[0-9a-f\]\{40\}\$/);
    assert.match(verifier, /rev-parse --verify HEAD\^\{commit\}/);
    assert.match(verifier, /status --porcelain --untracked-files=normal/);
  });

  it('checks service identities, least privilege, Docker, and protected files', () => {
    assert.match(verifier, /id -nG hellodeploy-web/);
    assert.match(verifier, /id -nG hellodeploy-worker/);
    assert.match(verifier, /root:hellodeploy-config:640/);
    assert.match(verifier, /root:root:755/);
    assert.match(verifier, /runuser -u hellodeploy-worker -- docker info/);
    assert.match(verifier, /runuser -u hellodeploy-web -- docker info/);
  });

  it('requires every prepared unit to remain inactive and disabled', () => {
    assert.match(verifier, /systemctl is-active --quiet/);
    assert.match(verifier, /systemctl is-enabled --quiet/);
    assert.match(verifier, /prepared unit is active or enabled/);
    assert.match(verifier, /Nginx helper socket exists before activation/);
  });

  it('checks existing Nginx, candidate port availability, and production configuration', () => {
    assert.match(verifier, /nginx -t/);
    assert.match(verifier, /ss -H -ltn "sport = :\$PORT"/);
    assert.match(verifier, /--component web --require-production/);
    assert.match(verifier, /--component worker --require-production/);
  });

  it('is invoked by preparation before the installer reports completion', () => {
    const verification = installer.indexOf('verify-prepared-installation.sh');
    const completion = installer.indexOf('Preparation mode complete');
    const activation = installer.indexOf('systemctl enable --now');
    assert.ok(verification > 0 && verification < completion && completion < activation);
    assert.match(installer, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT="\$RELEASE_COMMIT"/);
  });

  it('contains no service, ingress, queue, or traffic mutation commands', () => {
    assert.doesNotMatch(
      verifier,
      /systemctl (start|stop|restart|enable|disable)|nginx -s|docker (run|stop|rm)|queue.*(pause|resume)/,
    );
  });
});
