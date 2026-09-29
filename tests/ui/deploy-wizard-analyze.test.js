import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { DetectionStatus, PackageManager, RuntimeType } from '@hellodeploy/contracts';

process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { buildAnalysisFindings } =
  await import('../../apps/web/src/controllers/deploy-wizard.controller.js');

const { renderFile } = ejs;
const analyzeView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/wizard/analyze.ejs', import.meta.url),
);
const progressPartial = fileURLToPath(
  new URL('../../apps/web/src/views/partials/wizard-progress.ejs', import.meta.url),
);
const sidebarPartial = fileURLToPath(
  new URL('../../apps/web/src/views/partials/sidebar.ejs', import.meta.url),
);

const steps = [
  { key: 'repository', label: 'Choose your website', status: 'COMPLETE', href: '#', position: 1 },
  { key: 'analyze', label: 'Check your project', status: 'CURRENT', href: '#', position: 2 },
  { key: 'identity', label: 'Name your website', status: 'UPCOMING', href: '#', position: 3 },
];

function renderAnalyze(overrides = {}) {
  return renderFile(analyzeView, {
    project: { slug: 'demo', name: 'Demo', buildConfiguration: {} },
    membership: { role: 'OWNER' },
    repository: { fullName: 'henson/demo' },
    wizardSteps: steps,
    fieldConfidence: {},
    detection: { status: DetectionStatus.READY, issues: [] },
    findings: [{ key: 'runtime', label: 'A Next.js website detected', status: 'OK' }],
    needsReview: false,
    hasRun: true,
    isReady: true,
    csrfToken: 'placeholder',
    ...overrides,
  });
}

describe('analysis findings', () => {
  it('names the technology in words a non-developer reads', () => {
    const findings = buildAnalysisFindings(
      { runtimeType: RuntimeType.NEXTJS, buildConfiguration: {} },
      { issues: [] },
    );

    assert.equal(findings[0].label, 'A Next.js website detected');
  });

  it('reports a build command as found without printing it', () => {
    const findings = buildAnalysisFindings(
      { runtimeType: RuntimeType.NEXTJS, buildConfiguration: { buildCommand: 'npm run build' } },
      { issues: [] },
    );

    assert.ok(findings.some((finding) => finding.label === 'Build settings found'));
  });

  it('never exposes the raw command', () => {
    const findings = buildAnalysisFindings(
      { runtimeType: RuntimeType.NEXTJS, buildConfiguration: { buildCommand: 'npm run build' } },
      { issues: [] },
    );

    assert.ok(!findings.some((finding) => /npm run build/.test(finding.label)));
  });

  it('claims nothing about a setting detection did not produce', () => {
    const findings = buildAnalysisFindings(
      { runtimeType: RuntimeType.STATIC, buildConfiguration: {} },
      { issues: [] },
    );

    assert.ok(!findings.some((finding) => finding.key === 'start'));
  });

  it('names the package manager it found', () => {
    const findings = buildAnalysisFindings(
      { runtimeType: RuntimeType.NEXTJS, buildConfiguration: {} },
      { issues: [], packageManager: PackageManager.PNPM },
    );

    assert.ok(findings.some((finding) => /pnpm/.test(finding.label)));
  });

  it('carries a detection error through as blocking', () => {
    const findings = buildAnalysisFindings(
      { runtimeType: RuntimeType.UNKNOWN, buildConfiguration: {} },
      { issues: [{ level: 'ERROR', message: 'No start script found.' }] },
    );

    assert.equal(findings.at(-1).status, 'BLOCKED');
  });

  it('carries a detection warning through as non-blocking', () => {
    const findings = buildAnalysisFindings(
      { runtimeType: RuntimeType.NEXTJS, buildConfiguration: {} },
      { issues: [{ level: 'WARNING', message: 'No lock file found.' }] },
    );

    assert.equal(findings.at(-1).status, 'WARNING');
  });
});

describe('analysis step', () => {
  it('leads with what was found when detection succeeded', async () => {
    assert.match(await renderAnalyze(), /Here is what we found/);
  });

  it('offers to continue when detection is confident', async () => {
    assert.match(await renderAnalyze(), /setup\/identity/);
  });

  it('asks for a glance at weakly-evidenced settings', async () => {
    assert.match(
      await renderAnalyze({ needsReview: true }),
      /not certain it got all of these right/,
    );
  });

  it('requires confirmation before continuing past a guess', async () => {
    assert.match(await renderAnalyze({ needsReview: true }), /setup\/analyze\/confirm/);
  });

  it('asks for help rather than blaming the owner when detection fails', async () => {
    const html = await renderAnalyze({
      detection: { status: DetectionStatus.NEEDS_ATTENTION, issues: [] },
      isReady: false,
      findings: [{ key: 'issue-0', label: 'No start script found.', status: 'BLOCKED' }],
    });

    assert.match(html, /need your help with this project/);
  });

  it('does not let the owner continue past a blocking problem', async () => {
    const html = await renderAnalyze({
      detection: { status: DetectionStatus.NEEDS_ATTENTION, issues: [] },
      isReady: false,
      findings: [{ key: 'issue-0', label: 'No start script found.', status: 'BLOCKED' }],
    });

    assert.doesNotMatch(html, /setup\/identity/);
  });

  it('always offers a way to check again', async () => {
    assert.match(await renderAnalyze({ isReady: false }), /Check again/);
  });

  it('labels each finding for screen readers, not by glyph alone', async () => {
    assert.match(await renderAnalyze(), /<span class="sr-only">\s*\n?\s*Found:/);
  });
});

describe('setup progress indicator', () => {
  it('marks the current step for assistive technology', async () => {
    const html = await renderFile(progressPartial, { wizardSteps: steps });
    assert.match(html, /aria-current="step"/);
  });

  it('names each step state in text, not colour alone', async () => {
    const html = await renderFile(progressPartial, { wizardSteps: steps });
    assert.match(html, /Not started/);
  });

  it('lets the owner return to a completed step', async () => {
    const html = await renderFile(progressPartial, { wizardSteps: steps });
    assert.match(html, /<a href="#" class="wizard-progress__link"/);
  });
});

describe('navigation current-page marking', () => {
  it('emits a usable aria-current in the sidebar', async () => {
    const html = await renderFile(sidebarPartial, {
      currentPath: '/dashboard',
      user: { platformRole: 'USER' },
      uiMode: 'SIMPLE',
      csrfToken: 'placeholder',
    });

    assert.match(html, /aria-current="page"/);
  });

  it('does not emit an html-escaped aria-current', async () => {
    const html = await renderFile(sidebarPartial, {
      currentPath: '/dashboard',
      user: { platformRole: 'USER' },
      uiMode: 'SIMPLE',
      csrfToken: 'placeholder',
    });

    assert.doesNotMatch(html, /aria-current=&#34;/);
  });
});
