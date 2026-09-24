import assert from 'node:assert/strict';
import { before, after, beforeEach, it } from 'node:test';
import { hashToken } from '@hellodeploy/security';
import { Project } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';
import {
  getHookDeploymentStatus,
  getHookCapabilities,
  postTriggerDeployHook,
} from '../../apps/web/src/controllers/deploy-hook.controller.js';
before(startTestDb);
after(stopTestDb);
beforeEach(clearTestDb);
async function invoke(handler, project, id, token = 'hook-token', body = {}) {
  const res = {
    code: 200,
    headers: {},
    set(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler(
    {
      params: { projectId: project._id.toString(), deploymentId: id, token },
      body,
      get: () => `Bearer ${token}`,
    },
    res,
    (error) => {
      throw error;
    },
  );
  return res;
}
it('status is scoped to its project, token authenticated and redacted', async () => {
  const p = await createProject({ deployHookTokenHash: hashToken('hook-token') });
  const d = await createDeployment(p._id, {
    status: 'HEALTHY',
    configurationFingerprint: 'fingerprint',
    failureSummary: 'private raw log',
  });
  await Project.updateOne({ _id: p._id }, { $set: { activeDeploymentId: d._id } });
  const result = await invoke(getHookDeploymentStatus, p, d.id);
  assert.equal(result.code, 200);
  assert.equal(result.body.active, true);
  assert.equal(result.body.commitSha, 'a'.repeat(40));
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(result.body).includes('private raw log'));
  assert.equal((await invoke(getHookDeploymentStatus, p, d.id, 'wrong')).code, 404);
  const other = await createProject({
    deployHookTokenHash: hashToken('hook-token'),
    platformSubdomain: 'other-hook-project',
  });
  assert.equal((await invoke(getHookDeploymentStatus, other, d.id)).code, 404);
  assert.equal((await invoke(getHookDeploymentStatus, p, 'invalid')).code, 404);
});
it('hook rejects malformed SHAs before enqueueing', async () => {
  const p = await createProject({ deployHookTokenHash: hashToken('hook-token') });
  assert.equal(
    (await invoke(postTriggerDeployHook, p, '', 'hook-token', { commitSha: 'main' })).code,
    400,
  );
});
it('enforces one in-flight release per project at the database boundary', async () => {
  await Project.init();
  const { Deployment } = await import('@hellodeploy/database');
  await Deployment.init();
  const p = await createProject();
  await createDeployment(p._id);
  await assert.rejects(createDeployment(p._id, { sequenceNumber: 2 }), { code: 11000 });
});

it('capabilities require the project token and report the installed concurrency guard', async () => {
  const { Deployment } = await import('@hellodeploy/database');
  await Deployment.init();
  const p = await createProject({ deployHookTokenHash: hashToken('hook-token') });
  const result = await invoke(getHookCapabilities, p, '');
  assert.equal(result.code, 200);
  assert.equal(result.body.protocolVersion, 1);
  assert.equal(result.body.concurrentDeploymentGuard, true);
  assert.equal((await invoke(getHookCapabilities, p, '', 'wrong')).code, 404);
  assert.ok(!JSON.stringify(result.body).includes('hook-token'));
});
