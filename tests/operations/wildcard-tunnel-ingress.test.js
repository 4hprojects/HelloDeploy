import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const activation = await readFile(
  new URL('../../infrastructure/activate-wildcard-tunnel-ingress.sh', import.meta.url),
  'utf8',
);

describe('P2 wildcard tunnel ingress activation', () => {
  it('requires the immutable release, inactive worker, active helper, and paused queue', () => {
    assert.match(activation, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT/);
    assert.match(activation, /status --porcelain/);
    assert.match(activation, /is-active --quiet hellodeploy-worker/);
    assert.match(activation, /is-active --quiet hellodeploy-nginx-helper/);
    assert.match(activation, /verify-nginx-helper-live\.js --check-queue-only/);
  });

  it('updates both same-tunnel connector configs with one wildcard rule', () => {
    assert.match(activation, /\/etc\/cloudflared\/config\.yml/);
    assert.match(activation, /\/etc\/cloudflared\/hellodeploy\.yml/);
    assert.match(activation, /\*\.apps\.hellodeploy\.online/);
    assert.match(activation, /Dashboard connectors do not reference the same tunnel/);
    assert.ok(activation.includes('print "  - hostname: \\"" hostname "\\""'));
    assert.match(activation, /service: http:\/\/localhost:80/);
  });

  it('validates candidates before restarting only the dashboard connectors', () => {
    assert.match(activation, /ingress validate/);
    assert.match(activation, /ingress rule/);
    assert.match(activation, /cloudflared\.service/);
    assert.match(activation, /cloudflared-hellodeploy\.service/);
    assert.doesNotMatch(activation, /restart .*cloudflared-hellorun/);
    assert.doesNotMatch(activation, /hellodeploy-worker.*(?:start|restart)/);
  });

  it('waits for connector convergence and reports a safe failure stage', () => {
    assert.match(activation, /wait_for_url/);
    assert.match(activation, /seq 1 30/);
    assert.match(activation, /sleep 2/);
    assert.match(activation, /CURRENT_STAGE="connector-restart"/);
    assert.match(activation, /CURRENT_STAGE="public-convergence"/);
    assert.match(activation, /failed during %s/);
  });

  it('restores both configs and keeps the queue paused on failure', () => {
    assert.match(activation, /Wildcard tunnel activation failed during %s; restoring/);
    assert.match(activation, /CRITICAL: tunnel rollback verification failed/);
    assert.match(activation, /keep the queue paused/);
    assert.doesNotMatch(activation, /queue-maintenance\.js resume/);
    assert.doesNotMatch(activation, /tunnel route dns/);
  });
});
