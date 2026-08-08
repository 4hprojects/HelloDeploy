import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const cutover = await readFile(
  new URL('../../infrastructure/activate-dashboard-cutover.sh', import.meta.url),
  'utf8',
);

describe('P2 dashboard traffic cutover', () => {
  it('requires the immutable release, active candidates, and paused queue', () => {
    assert.match(cutover, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT/);
    assert.match(cutover, /status --porcelain/);
    assert.match(cutover, /is-active --quiet hellodeploy-web/);
    assert.match(cutover, /is-active --quiet hellodeploy-worker/);
    assert.match(cutover, /is-active --quiet hellodeploy-nginx-helper/);
    assert.match(cutover, /verify-nginx-helper-live\.js "\$@"/);
    assert.match(cutover, /check-worker-readiness\.js/);
    assert.match(cutover, /already exists; refusing an ambiguous retry/);
  });

  it('re-verifies candidate health before touching any routing', () => {
    const recheckStage = cutover.indexOf('CURRENT_STAGE="candidate-recheck"');
    const vhostStage = cutover.indexOf('CURRENT_STAGE="legacy-vhost-disable"');
    assert.ok(recheckStage >= 0 && recheckStage < vhostStage);
    assert.match(cutover, /http:\/\/127\.0\.0\.1:\$PORT\/health/);
    assert.match(cutover, /http:\/\/127\.0\.0\.1:\$PORT\/ready/);
  });

  it('disables the legacy vhost and installs the platform vhost via the existing renderer', () => {
    assert.match(cutover, /LEGACY_VHOST_LINK="\/etc\/nginx\/sites-enabled\/hellodeploy"/);
    assert.match(cutover, /rm -f "\$LEGACY_VHOST_LINK"/);
    assert.match(cutover, /LEGACY_VHOST_REMOVED=true/);
    assert.match(cutover, /configure-platform-ingress\.sh" "\$HD_HOME\/\.env"/);
  });

  it('rewrites only the two dashboard hostname service lines, not the wildcard entry', () => {
    assert.match(cutover, /hostname: \(www\\\.\)\?hellodeploy\\\.online\$/);
    assert.match(cutover, /service: http:\/\/localhost:3001/);
    assert.match(cutover, /service: http:\/\/localhost:80/);
    assert.match(cutover, /count != 2.*exit 45/);
    assert.doesNotMatch(cutover, /\*\.hellodeploy\.online/);
  });

  it('validates candidates before restarting only the dashboard connectors', () => {
    assert.match(cutover, /ingress validate/);
    assert.match(cutover, /cloudflared\.service/);
    assert.match(cutover, /cloudflared-hellodeploy\.service/);
    assert.doesNotMatch(cutover, /restart .*cloudflared-hellorun/);
  });

  it('proves traffic actually moved through Nginx, not just that it still responds', () => {
    assert.match(cutover, /access\.log/);
    assert.match(cutover, /ACCESS_LOG_LINES_AFTER <= ACCESS_LOG_LINES_BEFORE/);
    assert.match(cutover, /may still be bypassing Nginx/);
    assert.match(cutover, /hellodeploy\\\.sid=/);
    assert.match(cutover, /secure httponly samesite=strict/);
  });

  it('never stops or restarts the PM2 process, and never resumes the queue', () => {
    assert.doesNotMatch(cutover, /pm2 (stop|restart|delete)/i);
    assert.doesNotMatch(cutover, /queue-maintenance\.js resume/);
    assert.doesNotMatch(cutover, /queue\.resume/);
  });

  it('restores the prior PM2/tunnel path on failure and reports a critical stop condition', () => {
    assert.match(
      cutover,
      /Dashboard cutover failed during %s; restoring the prior PM2\/tunnel path/,
    );
    assert.match(cutover, /ln -s "\$LEGACY_VHOST_TARGET" "\$LEGACY_VHOST_LINK"/);
    assert.match(
      cutover,
      /CRITICAL: dashboard rollback verification failed; keep the queue paused/,
    );
    assert.match(cutover, /traffic_cutover=performed/);
  });
});
