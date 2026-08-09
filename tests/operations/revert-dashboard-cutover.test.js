import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const revert = await readFile(
  new URL('../../infrastructure/revert-dashboard-cutover.sh', import.meta.url),
  'utf8',
);

describe('P2 dashboard traffic cutover revert', () => {
  it('requires the immutable release and refuses an ambiguous state', () => {
    assert.match(revert, /HELLODEPLOY_EXPECTED_RELEASE_COMMIT/);
    assert.match(revert, /status --porcelain/);
    assert.match(revert, /Platform Nginx vhost is absent; refusing an ambiguous revert/);
    assert.match(revert, /Legacy PM2 vhost is already enabled; refusing an ambiguous revert/);
  });

  it('confirms PM2 is actually healthy before routing any traffic back to it', () => {
    const precheckStage = revert.indexOf('CURRENT_STAGE="pm2-precheck"');
    const backupStage = revert.indexOf('CURRENT_STAGE="backup"');
    assert.ok(precheckStage >= 0 && precheckStage < backupStage);
    assert.match(revert, /http:\/\/127\.0\.0\.1:3001\/health/);
  });

  it('rewrites the dashboard hostname service lines back to PM2, not the wildcard entry', () => {
    assert.match(revert, /hostname: \(www\\\.\)\?hellodeploy\\\.online\$/);
    assert.match(revert, /service: http:\/\/localhost:80/);
    assert.match(revert, /service: http:\/\/localhost:3001/);
    assert.match(revert, /count != 2.*exit 45/);
    assert.doesNotMatch(revert, /\*\.hellodeploy\.online/);
  });

  it('re-enables the legacy vhost and removes the platform vhost', () => {
    assert.match(revert, /rm -f "\$PLATFORM_VHOST"/);
    assert.match(revert, /ln -s "\$LEGACY_VHOST_TARGET" "\$LEGACY_VHOST_LINK"/);
    assert.match(revert, /nginx -t/);
    assert.match(revert, /systemctl reload nginx/);
  });

  it('never touches PM2 or the candidate services directly, and never resumes the queue', () => {
    assert.doesNotMatch(revert, /pm2 (stop|restart|delete|start)/i);
    assert.doesNotMatch(revert, /systemctl (stop|restart) hellodeploy-(web|worker)/);
    assert.doesNotMatch(revert, /queue-maintenance\.js resume/);
    assert.doesNotMatch(revert, /queue\.resume/);
  });

  it('restores the isolated-service path on failure and reports a critical stop condition', () => {
    assert.match(
      revert,
      /Dashboard cutover revert failed during %s; restoring the isolated-service path/,
    );
    assert.match(revert, /CRITICAL: dashboard rollback verification failed; keep the queue paused/);
    assert.match(revert, /traffic_cutover=reverted/);
  });

  it('re-syncs Nginx to the platform vhost on rollback if the legacy vhost was already restored', () => {
    const nginxRevertedSet = revert.indexOf('NGINX_REVERTED=true');
    const nginxVhostRevertStage = revert.indexOf('CURRENT_STAGE="nginx-vhost-revert"');
    assert.ok(nginxRevertedSet > nginxVhostRevertStage);

    const rollbackFn = revert.slice(
      revert.indexOf('rollback() {'),
      revert.indexOf('trap rollback EXIT'),
    );
    assert.match(rollbackFn, /if \[\[ "\$NGINX_REVERTED" == true \]\]; then/);
    assert.match(rollbackFn, /rm -f "\$LEGACY_VHOST_LINK"/);
    assert.match(rollbackFn, /configure-platform-ingress\.sh" "\$HD_HOME\/\.env"/);
    // Rollback's own critical check must only depend on hellodeploy.online -- HelloRun
    // can be unhealthy for reasons entirely outside this script's control, and that
    // must never be reported as this rollback having failed.
    assert.doesNotMatch(rollbackFn, /hellorun\.online/);
  });
});
