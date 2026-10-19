import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';

const { renderFile } = ejs;

const detectionUrl = new URL(
  '../../apps/web/src/views/pages/projects/detection.ejs',
  import.meta.url,
);
const detectionPath = fileURLToPath(detectionUrl);
const detection = await readFile(detectionUrl, 'utf8');
const settings = await readFile(
  new URL('../../apps/web/src/views/pages/projects/settings.ejs', import.meta.url),
  'utf8',
);
const guidedFields = await readFile(
  new URL('../../apps/web/src/views/partials/guided-build-fields.ejs', import.meta.url),
  'utf8',
);
const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const baseProject = {
  slug: 'sample-app',
  name: 'Sample App',
  productionBranch: 'main',
  runtimeType: null,
  buildConfiguration: {},
  buildFilters: {},
};

const repository = {
  fullName: 'owner/sample-app',
  defaultBranch: 'main',
  lastCommitSha: 'a'.repeat(40),
};

function renderDetection(overrides = {}) {
  return renderFile(detectionPath, {
    project: { ...baseProject, ...(overrides.project || {}) },
    repo: overrides.repo === undefined ? repository : overrides.repo,
    membership: { role: overrides.role || 'OWNER' },
    detectionResult: overrides.detectionResult || null,
    bcErrors: overrides.bcErrors || {},
    bcValues: overrides.bcValues || null,
    bfErrors: overrides.bfErrors || {},
    bfValues: overrides.bfValues || null,
    csrfToken: 'test-token',
    isStrategyEnabledFor: overrides.isStrategyEnabledFor,
  });
}

describe('guided detection inputs', () => {
  it('presents an initial app check without technical decisions', async () => {
    const html = await renderDetection();

    assert.match(html, /Not checked/);
    assert.match(html, /Check my app/);
    assert.match(html, /Waiting to be checked/);
    assert.match(html, /Production branch/);
  });

  it('shows a friendly ready state and runtime name after detection', async () => {
    const html = await renderDetection({
      project: {
        runtimeType: 'REACT',
        detection: {
          status: 'READY',
          checkedAt: new Date(),
          checkedCommitSha: 'a'.repeat(40),
        },
        buildConfiguration: {
          buildCommand: 'npm run build',
          outputDirectory: 'dist',
          healthCheckPath: '/',
        },
      },
    });

    assert.match(html, /Ready to deploy/);
    assert.match(html, /React app/);
    assert.match(html, /Check again/);
    assert.match(html, /HelloDeploy found the settings it needs/);
  });

  it('translates issue levels and adds a shareable next action', async () => {
    const html = await renderDetection({
      project: { runtimeType: 'UNKNOWN' },
      detectionResult: {
        isValid: false,
        issues: [
          { level: 'ERROR', message: 'No package.json or index.html found.' },
          { level: 'WARNING', message: 'No lock file found.' },
        ],
      },
    });

    assert.match(html, /Needs attention/);
    assert.match(html, /Fix required/);
    assert.match(html, /Recommendation/);
    assert.match(html, /Share this message with the person who built the app/);
    assert.match(html, /You can continue/);
  });

  it('does not show a ready summary when the latest supported-runtime check failed', async () => {
    const html = await renderDetection({
      project: {
        runtimeType: 'NEXTJS',
        buildConfiguration: { buildCommand: 'npm run build' },
      },
      detectionResult: {
        isValid: false,
        issues: [{ level: 'ERROR', message: 'No build script found.' }],
      },
    });

    assert.match(html, /Needs attention/);
    assert.doesNotMatch(html, /Ready to deploy/);
  });

  it('opens advanced settings for validation errors and preserves entered values', async () => {
    const html = await renderDetection({
      project: { runtimeType: 'NODEJS' },
      bcErrors: { applicationPort: 'Application port is invalid.' },
      bcValues: { applicationPort: '70000', healthCheckPath: '/' },
    });

    assert.match(html, /<details class="guided-disclosure mt-6" open>/);
    assert.match(html, /value="70000"/);
    assert.match(html, /Application port is invalid/);
    assert.match(
      html,
      /aria-describedby="detection-application-port-hint detection-application-port-error"/,
    );
  });

  it('keeps advanced forms read-only for non-owner roles', async () => {
    const html = await renderDetection({
      role: 'VIEWER',
      project: {
        runtimeType: 'EXPRESS',
        buildConfiguration: {
          startCommand: 'npm start',
          applicationPort: 3000,
          healthCheckPath: '/',
        },
      },
    });

    assert.doesNotMatch(html, /Save advanced settings/);
    assert.doesNotMatch(html, /Save deploy rules/);
    assert.match(html, /Working-page check/);
  });

  it('hides the app check button from non-owner roles', async () => {
    const html = await renderDetection({ role: 'VIEWER' });

    assert.doesNotMatch(html, /action="\/projects\/sample-app\/detection"/);
  });

  it('tells non-owner roles that only the owner can run the app check', async () => {
    const html = await renderDetection({ role: 'VIEWER' });

    assert.match(html, /Only the project owner can run the app check/);
  });

  it('offers the detected Python framework and module when the pilot is enabled', async () => {
    const html = await renderDetection({
      project: {
        _id: 'p1',
        runtimeType: 'PYTHON',
        detection: { status: 'READY', recommendedBuildStrategy: 'python_django_v1' },
        buildConfiguration: { applicationPort: 8000, applicationModule: 'mysite.wsgi:application' },
      },
      isStrategyEnabledFor: () => true,
    });
    assert.match(
      html,
      /<option value="python_django_v1" selected>[\s\S]*name="applicationModule"\s+value="mysite\.wsgi:application"/,
    );
  });

  it('explains the Python pilot when it is not enabled for the project', async () => {
    const html = await renderDetection({
      project: {
        _id: 'p1',
        runtimeType: 'PYTHON',
        detection: { status: 'READY', recommendedBuildStrategy: 'python_django_v1' },
        buildConfiguration: { applicationPort: 8000, applicationModule: 'mysite.wsgi:application' },
      },
      isStrategyEnabledFor: (strategy) => strategy === 'legacy_generated',
    });
    assert.match(
      html,
      /Python apps are in a limited pilot and are not enabled for this project yet/,
    );
  });

  it('shows an application module error beside its field', async () => {
    const html = await renderDetection({
      project: {
        _id: 'p1',
        runtimeType: 'PYTHON',
        detection: { status: 'READY', recommendedBuildStrategy: 'python_django_v1' },
        buildConfiguration: { applicationPort: 8000, applicationModule: 'mysite.wsgi:application' },
      },
      isStrategyEnabledFor: () => true,
      bcErrors: { applicationModule: 'Application module must use the module:attribute form.' },
      bcValues: { buildStrategy: 'python_flask_v1', applicationModule: 'main' },
    });
    assert.match(html, /id="detection-application-module-error"[^>]*>Application module must use/);
  });

  it('offers the PHP app type and document root when the pilot is enabled', async () => {
    const html = await renderDetection({
      project: {
        _id: 'p2',
        runtimeType: 'PHP',
        detection: { status: 'READY', recommendedBuildStrategy: 'php_laravel_v1' },
        buildConfiguration: { outputDirectory: 'public' },
      },
      isStrategyEnabledFor: () => true,
    });
    assert.match(
      html,
      /<option value="php_laravel_v1" selected>[\s\S]*<option value="public" selected>public folder/,
    );
  });

  it('explains the PHP pilot when it is not enabled for the project', async () => {
    const html = await renderDetection({
      project: { _id: 'p2', runtimeType: 'PHP', buildConfiguration: {} },
      isStrategyEnabledFor: (strategy) => strategy === 'legacy_generated',
    });
    assert.match(html, /PHP apps are in a limited pilot/);
  });

  it('offers the Java build tool when the pilot is enabled', async () => {
    const html = await renderDetection({
      project: {
        _id: 'p4',
        runtimeType: 'JAVA',
        detection: { status: 'READY', recommendedBuildStrategy: 'java_gradle_v1' },
        buildConfiguration: { healthCheckPath: '/actuator/health' },
      },
      isStrategyEnabledFor: () => true,
    });
    assert.match(html, /<option value="java_gradle_v1" selected>Gradle \(gradlew\)/);
  });

  it('offers owner Dockerfiles and prebuilt images only on the container pilots', async () => {
    const html = await renderDetection({
      project: { _id: 'p5', runtimeType: 'EXPRESS', buildConfiguration: {} },
      isStrategyEnabledFor: (strategy) => strategy === 'oci_image_v1',
    });
    assert.deepEqual(
      [html.includes('A prebuilt image'), html.includes('My Dockerfile')],
      [true, false],
    );
  });

  it('offers the container port to a PHP project choosing its own image', async () => {
    const html = await renderDetection({
      project: { _id: 'p6', runtimeType: 'PHP', buildConfiguration: {} },
      isStrategyEnabledFor: (strategy) => strategy === 'dockerfile_v1',
    });
    assert.match(html, /name="applicationPort"/);
  });

  it('shows no deployment source choice outside the container pilots', async () => {
    const html = await renderDetection({
      project: { _id: 'p5', runtimeType: 'EXPRESS', buildConfiguration: {} },
      isStrategyEnabledFor: (strategy) => strategy === 'legacy_generated',
    });
    assert.equal(html.includes('name="deploymentSource"'), false);
  });

  it('shares runtime-aware fields across detection and project settings', () => {
    assert.match(detection, /partials\/guided-build-fields/);
    assert.match(settings, /partials\/guided-build-fields/);
    assert.match(settings, /Advanced build settings/);
    assert.match(settings, /Automatic deploy rules/);
    assert.match(guidedFields, /A plain HTML site does not need a build command/);
    assert.match(guidedFields, /most Node\.js apps use/i);
    assert.match(guidedFields, /\/health/);
  });

  it('defines responsive status, disclosure, and field layouts', () => {
    assert.match(componentsCss, /\.detection-summary__details/);
    assert.match(componentsCss, /\.detection-state--ready/);
    assert.match(componentsCss, /var\(--color-green\)/);
    assert.match(componentsCss, /\.guided-disclosure__summary:focus-visible/);
    assert.match(componentsCss, /\.guided-build-grid/);
    assert.match(componentsCss, /@media \(max-width: 48rem\)/);
  });
});
