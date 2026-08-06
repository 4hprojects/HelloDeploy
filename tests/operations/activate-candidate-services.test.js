import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const activation = await readFile(
  new URL('../../infrastructure/activate-candidate-services.sh', import.meta.url),
  'utf8',
);

describe('P2 candidate service activation', () => {
  it('requires an immutable clean release, active helper, and inactive candidates', () => {
    assert.match(activation, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT/);
    assert.match(activation, /status --porcelain/);
    assert.match(activation, /is-active --quiet hellodeploy-nginx-helper/);
    assert.match(activation, /is-active --quiet hellodeploy-web/);
    assert.match(activation, /is-active --quiet hellodeploy-worker/);
    assert.match(activation, /already active; refusing an ambiguous retry/);
    assert.match(activation, /verify-nginx-helper-live\.js "\$@"/);
    assert.match(activation, /run_as_worker --check-queue-only/);
  });

  it('validates production configuration and the free candidate port before starting', () => {
    assert.match(activation, /validate-config\.js --component web --require-production/);
    assert.match(activation, /validate-config\.js --component worker --require-production/);
    assert.match(activation, /ss -H -ltn "sport = :\$PORT"/);
    assert.match(activation, /nginx -t/);
  });

  it('starts only the candidate web and worker units, never enabling or cutting over', () => {
    assert.match(activation, /systemctl start hellodeploy-web/);
    assert.match(activation, /systemctl start hellodeploy-worker/);
    assert.doesNotMatch(activation, /enable --now hellodeploy-web/);
    assert.doesNotMatch(activation, /enable --now hellodeploy-worker/);
    assert.doesNotMatch(activation, /nginx.*(?:reload|-s reload)/);
    assert.doesNotMatch(activation, /pm2/i);
    assert.doesNotMatch(activation, /queue-maintenance\.js resume/);
    assert.doesNotMatch(activation, /cloudflared/);

    const webFlag = activation.indexOf('WEB_STARTED=true');
    const webCommand = activation.indexOf('systemctl start hellodeploy-web');
    const workerFlag = activation.indexOf('WORKER_STARTED=true');
    const workerCommand = activation.indexOf('systemctl start hellodeploy-worker');
    assert.ok(webFlag > webCommand);
    assert.ok(workerFlag > workerCommand);
  });

  it('verifies candidate health, readiness, and the secure session cookie over loopback only', () => {
    assert.match(activation, /http:\/\/127\.0\.0\.1:\$PORT\/health/);
    assert.match(activation, /http:\/\/127\.0\.0\.1:\$PORT\/ready/);
    assert.match(activation, /"status":"ok"/);
    assert.match(activation, /"status":"ready"/);
    assert.match(activation, /X-Forwarded-Proto: https/);
    assert.match(activation, /curl -sS --max-time 20 -D -/);
    assert.match(activation, /set-cookie:.*hellodeploy\\\.sid=/);
    assert.match(activation, /secure httponly samesite=strict/);
    assert.match(activation, /check-worker-readiness\.js/);
    assert.doesNotMatch(activation, /https:\/\/hellodeploy\.online/);
    assert.doesNotMatch(activation, /https:\/\/hellorun\.online/);
  });

  it('stops candidate services and reports a critical failure if rollback cannot recover', () => {
    assert.match(activation, /Candidate service activation failed during %s/);
    assert.match(activation, /systemctl stop hellodeploy-worker/);
    assert.match(activation, /systemctl stop hellodeploy-web/);
    assert.match(activation, /CRITICAL: candidate service rollback failed/);
    assert.match(activation, /traffic_cutover=not-performed/);
  });
});
