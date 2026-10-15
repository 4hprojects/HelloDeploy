import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { ProjectInvitation, ProjectMembership, User } from '@hellodeploy/database';
import { ProjectRole, UserStatus, buildEmailContent } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

// dotenv loads the repo .env on import; a real key here would send real email.
process.env.RESEND_API_KEY = '';

const { createProject, inviteMember, claimPendingInvitations, revokeInvitation } =
  await import('../../apps/web/src/services/project.service.js');

const DAY_MS = 24 * 60 * 60 * 1000;

function createEmailRecorder() {
  const sent = [];
  return {
    sent,
    sendInviteEmail: async (message) => {
      sent.push(message);
      return { status: 'accepted' };
    },
    queueEmailNotification: async (input) => {
      sent.push(input);
      return { status: 'scheduled' };
    },
  };
}

async function setupProject() {
  const ownerId = objectId();
  const { project } = await createProject({ name: 'Event Hub', ownerId });
  return project;
}

function invite(
  project,
  inviteeEmail,
  deps = createEmailRecorder(),
  role = ProjectRole.MAINTAINER,
) {
  return inviteMember(
    {
      projectId: project._id,
      ownerId: project.ownerId,
      inviteeEmail,
      role,
      projectName: project.name,
      projectSlug: project.slug,
      inviterName: 'Owner Person',
      actorId: project.ownerId,
      correlationId: 'test',
    },
    deps,
  );
}

async function createVerifiedUser(email) {
  return User.create({
    firstName: 'New',
    lastName: 'Person',
    email,
    googleSubject: `google-${email}`,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
  });
}

describe('project.service — invitations for unregistered emails', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('stores a pending invitation instead of rejecting an unknown email', async () => {
    const project = await setupProject();
    await invite(project, 'Newcomer@Example.com');
    const invitation = await ProjectInvitation.findOne({ projectId: project._id }).lean();
    assert.equal(invitation.email, 'newcomer@example.com');
  });

  it('does not create a membership for an unknown email', async () => {
    const project = await setupProject();
    await invite(project, 'newcomer@example.com');
    const count = await ProjectMembership.countDocuments({ projectId: project._id });
    assert.equal(count, 1);
  });

  it('emails the invitation to the invited address', async () => {
    const project = await setupProject();
    const recorder = createEmailRecorder();
    await invite(project, 'newcomer@example.com', recorder);
    assert.equal(recorder.sent[0].to, 'newcomer@example.com');
  });

  it('reports a pending invite whose email was accepted', async () => {
    const project = await setupProject();
    const result = await invite(project, 'newcomer@example.com');
    assert.deepEqual(result, { success: true, pending: true, emailStatus: 'accepted' });
  });

  it('keeps the invitation when the email provider fails', async () => {
    const project = await setupProject();
    const failing = {
      sendInviteEmail: async () => {
        throw new Error('provider down');
      },
    };
    const result = await invite(project, 'newcomer@example.com', failing);
    assert.deepEqual(result, { success: true, pending: true, emailStatus: 'failed' });
  });

  it('rejects a second invite while the first is pending', async () => {
    const project = await setupProject();
    await invite(project, 'newcomer@example.com');
    const result = await invite(project, 'newcomer@example.com');
    assert.equal(result.error, 'This email has already been invited.');
  });

  it('refreshes an expired invitation for the same email', async () => {
    const project = await setupProject();
    await ProjectInvitation.create({
      projectId: project._id,
      email: 'newcomer@example.com',
      role: ProjectRole.VIEWER,
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const result = await invite(project, 'newcomer@example.com');
    assert.equal(result.success, true);
  });

  it('counts pending invitations toward the member limit', async () => {
    const project = await setupProject();
    await invite(project, 'first@example.com');
    await invite(project, 'second@example.com');
    const result = await invite(project, 'third@example.com');
    assert.equal(result.error, 'This project has reached its member limit.');
  });

  it('queues a member-added email when the invitee already has an account', async () => {
    const project = await setupProject();
    const existing = await createVerifiedUser('member@example.com');
    const recorder = createEmailRecorder();
    await invite(project, 'member@example.com', recorder);
    assert.deepEqual(
      { userId: recorder.sent[0].userId.toString(), kind: recorder.sent[0].kind },
      { userId: existing._id.toString(), kind: 'project-member-added' },
    );
  });
});

describe('project.service — claimPendingInvitations', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('adds the verified user with the invited role', async () => {
    const project = await setupProject();
    await invite(project, 'newcomer@example.com', createEmailRecorder(), ProjectRole.VIEWER);
    const user = await createVerifiedUser('newcomer@example.com');
    await claimPendingInvitations({ user, correlationId: 'test' });
    const membership = await ProjectMembership.findOne({
      projectId: project._id,
      userId: user._id,
    }).lean();
    assert.equal(membership.role, ProjectRole.VIEWER);
  });

  it('removes the invitation once claimed', async () => {
    const project = await setupProject();
    await invite(project, 'newcomer@example.com');
    const user = await createVerifiedUser('newcomer@example.com');
    await claimPendingInvitations({ user, correlationId: 'test' });
    const remaining = await ProjectInvitation.countDocuments({ projectId: project._id });
    assert.equal(remaining, 0);
  });

  it('ignores an expired invitation', async () => {
    const project = await setupProject();
    await ProjectInvitation.create({
      projectId: project._id,
      email: 'newcomer@example.com',
      role: ProjectRole.MAINTAINER,
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const user = await createVerifiedUser('newcomer@example.com');
    const claimed = await claimPendingInvitations({ user, correlationId: 'test' });
    assert.equal(claimed, 0);
  });
});

describe('project.service — revokeInvitation', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('deletes the invitation for its own project', async () => {
    const project = await setupProject();
    await invite(project, 'newcomer@example.com');
    const invitation = await ProjectInvitation.findOne({ projectId: project._id });
    await revokeInvitation({
      projectId: project._id,
      invitationId: invitation._id.toString(),
      actorId: project.ownerId,
    });
    const remaining = await ProjectInvitation.countDocuments({ projectId: project._id });
    assert.equal(remaining, 0);
  });

  it("leaves another project's invitation in place", async () => {
    const project = await setupProject();
    await invite(project, 'newcomer@example.com');
    const invitation = await ProjectInvitation.findOne({ projectId: project._id });
    const result = await revokeInvitation({
      projectId: objectId(),
      invitationId: invitation._id.toString(),
      actorId: project.ownerId,
    });
    assert.equal(result.success, false);
  });
});

describe('buildEmailContent — project-invite', () => {
  it('escapes HTML in the project name', () => {
    const content = buildEmailContent('project-invite', {
      inviterName: 'Owner',
      projectName: '<script>x</script>',
      role: ProjectRole.MAINTAINER,
      signupUrl: 'https://hellodeploy.online/create-account',
      email: 'newcomer@example.com',
      expiresInDays: 14,
    });
    assert.doesNotMatch(content.html, /<script>/);
  });
});
