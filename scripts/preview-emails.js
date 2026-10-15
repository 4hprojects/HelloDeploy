#!/usr/bin/env node
// Write every email kind with sample data to test-results/email-previews/ for review
// in a browser. Pass a platform URL to load the logo from a different host:
//   node scripts/preview-emails.js [https://hellodeploy.online]

import { mkdir, writeFile } from 'node:fs/promises';

import { ProjectRole, buildEmailContent } from '@hellodeploy/contracts';

const platformUrl = process.argv[2] ?? 'https://hellodeploy.online';
const outputDir = new URL('../test-results/email-previews/', import.meta.url);

const samples = {
  'project-invite': {
    inviterName: 'Henson Sagorsor',
    projectName: 'helloeventhub',
    role: ProjectRole.MAINTAINER,
    signupUrl: `${platformUrl}/create-account`,
    email: 'teammate@example.com',
    expiresInDays: 14,
  },
  'project-member-added': {
    firstName: 'Ada',
    inviterName: 'Henson Sagorsor',
    projectName: 'helloeventhub',
    role: ProjectRole.VIEWER,
    projectUrl: `${platformUrl}/projects/helloeventhub`,
  },
  'email-verification': {
    firstName: 'Ada',
    verificationUrl: `${platformUrl}/auth/verify-email?token=sample`,
  },
  'password-reset': { firstName: 'Ada', resetCode: '482913' },
  'password-changed': { firstName: 'Ada' },
  'project-paused': {
    firstName: 'Ada',
    projectName: 'helloeventhub',
    projectUrl: `${platformUrl}/projects/helloeventhub`,
  },
  'approval-requested': {
    firstName: 'Ada',
    projectName: 'helloeventhub',
    reviewUrl: `${platformUrl}/admin/approval-requests`,
    provisionalAfterMinutes: 30,
  },
  'deployment-success': {
    firstName: 'Ada',
    projectName: 'helloeventhub',
    sequenceNumber: 12,
    status: 'HEALTHY',
    commitSha: 'abcdef1234567890',
    dashboardUrl: `${platformUrl}/projects/helloeventhub/deployments`,
  },
  'deployment-failure': {
    firstName: 'Ada',
    projectName: 'helloeventhub',
    sequenceNumber: 13,
    status: 'FAILED',
    commitSha: '1111111234567890',
    failureCode: 'BUILD_FAILED',
    failureSummary: 'npm ERR! missing script: build',
    failureMessage: 'Your app failed to build.',
    failureAction: 'Check the build command in Project Settings, then deploy again.',
    dashboardUrl: `${platformUrl}/projects/helloeventhub/deployments`,
  },
};

await mkdir(outputDir, { recursive: true });
for (const [name, payload] of Object.entries(samples)) {
  const kind = name.startsWith('deployment-') ? 'deployment-result' : name;
  const { html } = buildEmailContent(kind, payload, { platformUrl });
  await writeFile(new URL(`${name}.html`, outputDir), html);
}
process.stdout.write(`Wrote ${Object.keys(samples).length} previews to ${outputDir.pathname}\n`);
