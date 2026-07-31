import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const activation = await readFile(
  new URL('../../infrastructure/activate-routing-foundation.sh', import.meta.url),
  'utf8',
);
const liveVerifier = await readFile(
  new URL('../../scripts/verify-nginx-helper-live.js', import.meta.url),
  'utf8',
);

describe('P2 routing foundation activation', () => {
  it('requires an immutable clean release, inactive worker, and paused queue', () => {
    assert.match(activation, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT/);
    assert.match(activation, /status --porcelain/);
    assert.match(activation, /is-active --quiet hellodeploy-worker/);
    assert.match(activation, /cd "\$HD_HOME"/);
    assert.match(activation, /\/usr\/bin\/node scripts\/verify-nginx-helper-live\.js/);
    assert.match(activation, /run_as_worker --check-queue-only/);
    assert.match(liveVerifier, /await queue\.isPaused\(\)/);
  });

  it('installs only the reviewed managed-route include and activates only the helper', () => {
    assert.match(activation, /include \/etc\/nginx\/hellodeploy\.d\/\*\.conf;/);
    assert.match(activation, /nginx -t/);
    assert.match(activation, /systemctl reload nginx/);
    assert.match(activation, /systemctl enable --now hellodeploy-nginx-helper/);
    assert.doesNotMatch(activation, /enable --now hellodeploy-worker/);
  });

  it('proves route create, replace, invalid-candidate restore, and removal', () => {
    assert.match(liveVerifier, /route_creation=passed/);
    assert.match(liveVerifier, /route_replacement=passed/);
    assert.match(liveVerifier, /invalid_candidate_restore=passed/);
    assert.match(liveVerifier, /route_removal=passed/);
  });

  it('rolls back the probe, helper, and include while leaving the queue paused', () => {
    assert.match(activation, /rm -f "\$PROBE_FILE"/);
    assert.match(activation, /disable --now hellodeploy-nginx-helper/);
    assert.match(activation, /rm -f "\$INCLUDE_FILE"/);
    assert.match(activation, /keep the queue paused/);
    assert.doesNotMatch(activation, /queue-maintenance\.js resume/);

    const rollbackFlag = activation.indexOf('HELPER_STARTED=true');
    const activationCommand = activation.indexOf('systemctl enable --now hellodeploy-nginx-helper');
    assert.ok(rollbackFlag >= 0 && rollbackFlag < activationCommand);
  });
});
