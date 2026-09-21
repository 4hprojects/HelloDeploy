import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { ProjectMembership } from '@hellodeploy/database';
import { ProjectRole } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { requireProjectRole } =
  await import('../../apps/web/src/middleware/require-project-role.js');

/** Minimal Express doubles: record what the middleware decided. */
function makeResponse() {
  const result = { statusCode: null, view: null, locals: {} };
  const res = {
    locals: result.locals,
    status(code) {
      result.statusCode = code;
      return res;
    },
    render(view, options) {
      result.view = view;
      result.message = options?.message;
      return res;
    },
  };
  return { res, result };
}

function makeRequest(slug, userId) {
  return {
    params: { slug },
    session: { user: { id: userId.toString() } },
    originalUrl: `/projects/${slug}/settings`,
  };
}

async function run(middleware, req) {
  const { res, result } = makeResponse();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { ...result, nextCalled, req };
}

async function seedMembership(role) {
  const project = await createProject();
  const userId = objectId();
  await ProjectMembership.create({ projectId: project._id, userId, role });
  return { project, userId };
}

describe('requireProjectRole', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('admits a user holding an allowed role', async () => {
    const { project, userId } = await seedMembership(ProjectRole.OWNER);
    const outcome = await run(
      requireProjectRole(ProjectRole.OWNER),
      makeRequest(project.slug, userId),
    );
    assert.equal(outcome.nextCalled, true);
  });

  it('refuses a member whose role is not allowed', async () => {
    const { project, userId } = await seedMembership(ProjectRole.VIEWER);
    const outcome = await run(
      requireProjectRole(ProjectRole.OWNER, ProjectRole.MAINTAINER),
      makeRequest(project.slug, userId),
    );
    assert.equal(outcome.statusCode, 403);
  });

  it('refuses a user with no membership at all', async () => {
    const project = await createProject();
    const outcome = await run(
      requireProjectRole(ProjectRole.VIEWER),
      makeRequest(project.slug, objectId()),
    );
    assert.equal(outcome.statusCode, 403);
  });

  it('never runs the handler when the role check fails', async () => {
    const { project, userId } = await seedMembership(ProjectRole.VIEWER);
    const outcome = await run(
      requireProjectRole(ProjectRole.OWNER),
      makeRequest(project.slug, userId),
    );
    assert.equal(outcome.nextCalled, false);
  });

  it('reports a missing project as not found rather than forbidden', async () => {
    const outcome = await run(
      requireProjectRole(ProjectRole.OWNER),
      makeRequest('no-such-project', objectId()),
    );
    assert.equal(outcome.statusCode, 404);
  });

  it('does not leak another project via a membership on a different project', async () => {
    const { userId } = await seedMembership(ProjectRole.OWNER);
    const otherProject = await createProject();
    const outcome = await run(
      requireProjectRole(ProjectRole.OWNER),
      makeRequest(otherProject.slug, userId),
    );
    assert.equal(outcome.statusCode, 403);
  });

  it('keeps the deploy hook token hash out of template locals', async () => {
    const project = await createProject({ deployHookTokenHash: 'secret-hash' });
    const userId = objectId();
    await ProjectMembership.create({
      projectId: project._id,
      userId,
      role: ProjectRole.OWNER,
    });
    const outcome = await run(
      requireProjectRole(ProjectRole.OWNER),
      makeRequest(project.slug, userId),
    );
    assert.equal(outcome.locals.currentProject.deployHookTokenHash, undefined);
  });

  it('attaches the membership for downstream handlers', async () => {
    const { project, userId } = await seedMembership(ProjectRole.MAINTAINER);
    const req = makeRequest(project.slug, userId);
    await run(requireProjectRole(ProjectRole.MAINTAINER), req);
    assert.equal(req.membership.role, ProjectRole.MAINTAINER);
  });
});
