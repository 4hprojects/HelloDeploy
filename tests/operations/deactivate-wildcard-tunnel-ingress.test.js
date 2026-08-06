import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const deactivation = await readFile(
  new URL('../../infrastructure/deactivate-wildcard-tunnel-ingress.sh', import.meta.url),
  'utf8',
);

describe('P2 wildcard tunnel ingress deactivation', () => {
  it('requires the immutable release, inactive worker, active helper, and paused queue', () => {
    assert.match(deactivation, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT/);
    assert.match(deactivation, /status --porcelain/);
    assert.match(deactivation, /is-active --quiet hellodeploy-worker/);
    assert.match(deactivation, /is-active --quiet hellodeploy-nginx-helper/);
    assert.match(deactivation, /verify-nginx-helper-live\.js --check-queue-only/);
  });

  it('removes the old wildcard rule from both same-tunnel connector configs', () => {
    assert.match(deactivation, /\/etc\/cloudflared\/config\.yml/);
    assert.match(deactivation, /\/etc\/cloudflared\/hellodeploy\.yml/);
    assert.match(deactivation, /OLD_WILDCARD_HOSTNAME="\*\.apps\.hellodeploy\.online"/);
    assert.match(deactivation, /Dashboard connectors do not reference the same tunnel/);
    assert.match(deactivation, /already absent; refusing an ambiguous retry/);
    assert.match(deactivation, /still present after removal/);
  });

  it('validates candidates before restarting only the dashboard connectors', () => {
    assert.match(deactivation, /ingress validate/);
    assert.match(deactivation, /cloudflared\.service/);
    assert.match(deactivation, /cloudflared-hellodeploy\.service/);
    assert.doesNotMatch(deactivation, /restart .*cloudflared-hellorun/);
    assert.doesNotMatch(deactivation, /hellodeploy-worker.*(?:start|restart)/);
  });

  it('waits for connector convergence and reports a safe failure stage', () => {
    assert.match(deactivation, /wait_for_url/);
    assert.match(deactivation, /CURRENT_STAGE="connector-restart"/);
    assert.match(deactivation, /CURRENT_STAGE="public-convergence"/);
    assert.match(deactivation, /failed during %s/);
  });

  it('restores both configs and keeps the queue paused on failure', () => {
    assert.match(deactivation, /Wildcard tunnel deactivation failed during %s; restoring/);
    assert.match(deactivation, /CRITICAL: tunnel rollback verification failed/);
    assert.match(deactivation, /keep the queue paused/);
    assert.doesNotMatch(deactivation, /queue-maintenance\.js resume/);
    assert.doesNotMatch(deactivation, /tunnel route dns/);
  });
});
