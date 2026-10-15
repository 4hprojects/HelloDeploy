import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ProjectRole, buildEmailContent } from '@hellodeploy/contracts';

const PLATFORM_URL = 'https://deploy.example.test';

const invitePayload = {
  inviterName: 'Henson Sagorsor',
  projectName: 'helloeventhub',
  role: ProjectRole.MAINTAINER,
  signupUrl: 'https://deploy.example.test/create-account',
  email: 'newcomer@example.test',
  expiresInDays: 14,
};

const samplePayloads = {
  'email-verification': { firstName: 'Ada', verificationUrl: `${PLATFORM_URL}/verify?t=1` },
  'password-reset': { firstName: 'Ada', resetCode: '123456' },
  'password-changed': { firstName: 'Ada' },
  'project-paused': { firstName: 'Ada', projectName: 'App', projectUrl: `${PLATFORM_URL}/p` },
  'approval-requested': {
    firstName: 'Ada',
    projectName: 'App',
    reviewUrl: `${PLATFORM_URL}/admin`,
    provisionalAfterMinutes: 30,
  },
  'deployment-result': {
    firstName: 'Ada',
    projectName: 'App',
    sequenceNumber: 3,
    status: 'HEALTHY',
    commitSha: 'abcdef1234',
    dashboardUrl: `${PLATFORM_URL}/d`,
  },
  'project-invite': invitePayload,
  'project-member-added': {
    firstName: 'Ada',
    inviterName: 'Owner',
    projectName: 'App',
    role: ProjectRole.VIEWER,
    projectUrl: `${PLATFORM_URL}/p`,
  },
};

describe('buildEmailContent layout', () => {
  it('shows the hosted logo when a platform URL is given', () => {
    const { html } = buildEmailContent('project-invite', invitePayload, {
      platformUrl: PLATFORM_URL,
    });
    assert.match(html, /<img src="https:\/\/deploy\.example\.test\/assets\/brand\/mark\.png"/);
  });

  it('falls back to the text wordmark without a platform URL', () => {
    const { html } = buildEmailContent('project-invite', invitePayload);
    assert.doesNotMatch(html, /<img/);
  });

  it('links the invitation button to the signup page', () => {
    const { html } = buildEmailContent('project-invite', invitePayload);
    assert.match(
      html,
      /<a href="https:\/\/deploy\.example\.test\/create-account"[^>]*>Accept invitation<\/a>/,
    );
  });

  it('escapes the project name in the invitation heading and details', () => {
    const { html } = buildEmailContent('project-invite', {
      ...invitePayload,
      projectName: '<b>x</b>',
    });
    assert.doesNotMatch(html, /<b>x<\/b>/);
  });

  it('gives the invitation a plain-text body with the signup link and expiry', () => {
    const { text } = buildEmailContent('project-invite', invitePayload);
    assert.match(
      text,
      /Accept invitation: https:\/\/deploy\.example\.test\/create-account[\s\S]*expires in 14 days/,
    );
  });

  it('marks a failed deployment with its plain-language reason', () => {
    const { html } = buildEmailContent('deployment-result', {
      ...samplePayloads['deployment-result'],
      status: 'FAILED',
      failureMessage: 'Your app failed to build.',
    });
    assert.match(html, />Failed<\/span>[\s\S]*Your app failed to build\./);
  });

  it('renders every email kind with the HelloDeploy wordmark', () => {
    const rendered = Object.entries(samplePayloads).map(([kind, payload]) =>
      buildEmailContent(kind, payload, { platformUrl: PLATFORM_URL }).html.includes(
        '>HelloDeploy</span>',
      ),
    );
    assert.deepEqual(
      rendered,
      Object.keys(samplePayloads).map(() => true),
    );
  });
});
