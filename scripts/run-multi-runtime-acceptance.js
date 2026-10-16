#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, stat, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  IN_FLIGHT_STATUSES,
  TERMINAL_STATUSES,
  assertAcceptanceEnvironment,
  assertImmutableDeployment,
  assertPrivateCanary,
  assertProtectedConfigMode,
  checkRoute,
  evaluateDockerInspect,
  findSensitiveText,
  measureStreaming,
  parseAcceptanceArguments,
  pollUntil,
  renderEvidenceMarkdown,
  sanitizeEvidence,
  validateAcceptanceConfig,
  validateFixtureManifest,
} from './lib/multi-runtime-acceptance.js';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repositoryRoot, 'tests/fixtures/multi-runtime/manifest.json');
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const DEPLOY_TIMEOUT_MS = 8 * 60 * 1000;

function report(message) {
  process.stdout.write(`[multi-runtime] ${message}\n`);
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    cwd: repositoryRoot,
    timeout: options.timeout ?? 60_000,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });
}

async function verifySourceCommit(repository, sha) {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${sha}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'hellodeploy-acceptance' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Fixture source commit ${sha.slice(0, 12)} is not reachable.`);
  }
}

async function loadProtectedInputs(options) {
  assertProtectedConfigMode(await stat(options.configPath));
  const [configText, manifestText] = await Promise.all([
    readFile(options.configPath, 'utf8'),
    readFile(manifestPath, 'utf8'),
  ]);
  const manifest = validateFixtureManifest(JSON.parse(manifestText));
  const config = validateAcceptanceConfig(JSON.parse(configText), manifest, {
    execute: options.execute,
    confirmEnvironment: options.confirmEnvironment,
    nodeEnv: process.env.NODE_ENV,
  });
  return { config, manifest };
}

async function inspectPlatformState(config, manifest, database, queueClient) {
  const { Project, Repository, Deployment, EnvironmentSecret } = database;
  const projects = [];
  for (const fixture of manifest.fixtures) {
    const protectedProject = config.projects.find((entry) => entry.fixtureId === fixture.id);
    const project = await Project.findById(protectedProject.projectId).lean();
    if (!project) {
      throw new Error(`Fixture project is missing: ${fixture.id}.`);
    }
    if (
      project.runtimeType !== fixture.runtimeType ||
      (project.buildStrategy ?? 'legacy_generated') !== fixture.buildStrategy ||
      (project.buildConfiguration?.applicationRoot ?? '.') !== fixture.applicationRoot ||
      (project.buildConfiguration?.applicationModule ?? null) !==
        (fixture.applicationModule ?? null)
    ) {
      throw new Error(`Stored project settings do not match fixture ${fixture.id}.`);
    }
    const repository = await Repository.findById(project.repositoryId).lean();
    if (!repository || repository.fullName !== config.fixtureRepository) {
      throw new Error(`Fixture repository does not match project ${fixture.id}.`);
    }
    const inFlight = await Deployment.exists({
      projectId: project._id,
      status: { $in: [...IN_FLIGHT_STATUSES] },
    });
    if (inFlight) {
      throw new Error(`Fixture project ${fixture.id} has an in-flight deployment.`);
    }
    if (fixture.id === 'private-secret-probe') {
      const canary = await EnvironmentSecret.findOne({
        projectId: project._id,
        name: 'ACCEPTANCE_PRIVATE_CANARY',
      }).lean();
      assertPrivateCanary(canary, config.privateCanary);
    }
    projects.push({ fixture, protectedProject, project });
  }

  const queue = queueClient.getDeploymentQueue();
  if (!queue || (await queue.getWorkersCount()) < 1) {
    throw new Error('No deployment worker is connected to the nonproduction queue.');
  }
  return projects;
}

async function runPreflight(config, manifest, database, queueClient) {
  report('validating protected source commits');
  await Promise.all([
    verifySourceCommit(config.fixtureRepository, config.baselineSha),
    verifySourceCommit(config.fixtureRepository, config.candidateSha),
  ]);

  report('checking platform readiness, remote builder, and registry');
  const ready = await fetch(new URL('/ready', config.platformBaseUrl), {
    signal: AbortSignal.timeout(20_000),
  });
  if (!ready.ok) {
    throw new Error(`Platform readiness returned ${ready.status}.`);
  }
  await run('docker', ['buildx', 'inspect', config.builderName, '--bootstrap'], {
    timeout: 120_000,
  });
  await run('oras', ['repo', 'tags', config.ghcrRepository]);

  report('checking project, database, queue, and safety state');
  return inspectPlatformState(config, manifest, database, queueClient);
}

async function waitForDeployment(Deployment, deploymentId, timeoutMs = BUILD_TIMEOUT_MS) {
  return pollUntil(
    () => Deployment.findById(deploymentId).lean(),
    (deployment) => deployment && TERMINAL_STATUSES.has(deployment.status),
    { timeoutMs, intervalMs: 2500 },
  );
}

async function triggerHook(project) {
  const response = await fetch(project.deployHookUrl, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 202) {
    throw new Error(`Deploy hook returned ${response.status}.`);
  }
  const body = await response.json();
  if (!/^[0-9a-f]{24}$/.test(body.deploymentId ?? '')) {
    throw new Error('Deploy hook returned no valid deployment id.');
  }
  return body.deploymentId;
}

async function createExactDeployment(project, commitSha, services) {
  const result = await services.createDeployment({
    projectId: project._id,
    actorId: project.ownerId,
    triggerType: services.DeploymentTrigger.SYSTEM,
    commitSha,
  });
  if (!result.success) {
    throw new Error(`Exact-SHA deployment was refused: ${result.error}`);
  }
  return result.deployment._id.toString();
}

async function inspectRuntime(deployment, fixture) {
  if (!deployment.activeContainerId) {
    throw new Error(`${fixture.id} has no active runtime container.`);
  }
  const { stdout } = await run('docker', ['inspect', deployment.activeContainerId]);
  const inspection = evaluateDockerInspect(JSON.parse(stdout)[0], {
    requireReadOnly: fixture.runtimeType === 'STATIC' || fixture.buildStrategy === 'next_export_v1',
  });
  if (Object.values(inspection).some((passed) => !passed)) {
    throw new Error(`${fixture.id} failed runtime isolation inspection.`);
  }
  return inspection;
}

async function assertDeploymentEvents(database, deploymentId, prohibitedValues) {
  const events = await database.DeploymentEvent.find({ deploymentId })
    .sort({ createdAt: 1 })
    .lean();
  if (events.some((event) => findSensitiveText(event.messageRedacted, prohibitedValues))) {
    throw new Error('Sanitized deployment events contain a protected value or credential pattern.');
  }
}

async function verifyHealthyFixture(context, fixtureEntry, deployment) {
  const { config, database } = context;
  const { fixture, protectedProject, project } = fixtureEntry;
  if (deployment.status !== 'HEALTHY' || deployment.commitSha !== config.candidateSha) {
    throw new Error(`${fixture.id} did not activate the configured candidate commit.`);
  }
  assertImmutableDeployment(deployment, project, fixture);
  const expectedMarkers = {
    static: 'static-ok',
    'react-vite': 'react-vite-ok',
    'vue-vite': 'vue-vite-ok',
    express: '"ok":true',
    node: '"ok":true',
    'next14-legacy': 'next14-ssr-ok',
    'next15-standard-app': 'next15-rsc-ssr-ok',
    'next15-export-pages': 'next15-export-static-ok',
    'next16-standalone-app': 'next16-standalone-rsc-ok',
    'next16-standard-pages': 'next16-pages-ssr-ok',
    'rollback-marker': 'candidate-v2',
    'registry-cleanup': 'candidate-v2',
    'resource-pressure': '"ok":true',
    'isolation-probe': '"dockerSocket":false',
    'private-secret-probe': 'runtime-private-canary-present',
  };
  const route = await checkRoute(new URL(fixture.probePath, protectedProject.routeUrl), {
    marker: expectedMarkers[fixture.id],
  });
  if (!route.ok || !route.markerFound) {
    throw new Error(`${fixture.id} route validation failed.`);
  }
  const isolation = await inspectRuntime(deployment, fixture);
  await assertDeploymentEvents(database, deployment._id, [config.privateCanary]);
  return { route, isolation };
}

async function runBrowserAndStreamingChecks(config) {
  const project = config.projects.find((entry) => entry.fixtureId === 'next15-standard-app');
  const stream = await measureStreaming(new URL('/stream', project.routeUrl));
  if (!stream.deliveredEarly || stream.totalMs < 500) {
    throw new Error('Next.js streaming response was buffered or completed too quickly.');
  }
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const acceptanceResponse = await page.goto(new URL('/acceptance', project.routeUrl).href, {
      waitUntil: 'networkidle',
    });
    if (acceptanceResponse?.headers()['x-fixture-middleware'] !== 'next15') {
      throw new Error('Next.js middleware response header was not observed.');
    }
    await page.getByRole('button', { name: 'Run server action' }).click();
    await page.waitForURL('**/acceptance/action-complete');
    await page.goto(new URL('/', project.routeUrl).href, { waitUntil: 'networkidle' });
    if (
      !(await page.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0))
    ) {
      throw new Error('next/image did not load the fixture asset.');
    }
  } finally {
    await browser.close();
  }

  const apiChecks = [
    ['next15-standard-app', '/api/acceptance'],
    ['next16-standalone-app', '/api/acceptance'],
    ['next16-standard-pages', '/api/acceptance'],
  ];
  for (const [fixtureId, route] of apiChecks) {
    const fixtureProject = config.projects.find((entry) => entry.fixtureId === fixtureId);
    const result = await checkRoute(new URL(route, fixtureProject.routeUrl), {
      marker: '"api":true',
    });
    if (!result.ok || !result.markerFound) {
      throw new Error(`${fixtureId} API route failed acceptance.`);
    }
  }

  const standalone = config.projects.find((entry) => entry.fixtureId === 'next16-standalone-app');
  const proxyResponse = await fetch(new URL('/acceptance', standalone.routeUrl), {
    signal: AbortSignal.timeout(20_000),
  });
  if (proxyResponse.headers.get('x-fixture-proxy') !== 'next16') {
    throw new Error('Next.js proxy response header was not observed.');
  }

  const isrUrl = new URL('/isr', project.routeUrl);
  const initialIsr = await (await fetch(isrUrl, { signal: AbortSignal.timeout(20_000) })).text();
  const immediateIsr = await (await fetch(isrUrl, { signal: AbortSignal.timeout(20_000) })).text();
  if (initialIsr !== immediateIsr) {
    throw new Error('Single-instance ISR was not stable inside its bounded revalidation window.');
  }
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const refreshedIsr = await (await fetch(isrUrl, { signal: AbortSignal.timeout(20_000) })).text();
  if (!refreshedIsr.includes('isr-value')) {
    throw new Error('Single-instance ISR route did not remain readable after revalidation.');
  }
  return stream;
}

async function runBuildkitEgressProbe(config) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hellodeploy-egress-'));
  const blockedTargets = config.controlPlaneTargets.map((target) => target.url);
  const script = [
    "const allowed=await fetch('https://registry.npmjs.org/npm',{signal:AbortSignal.timeout(5000)});",
    "if(!allowed.ok)throw new Error('allowed registry unavailable');",
    `const targets=${JSON.stringify(blockedTargets)};`,
    "for(const target of targets){try{await fetch(target,{signal:AbortSignal.timeout(3000)});throw new Error('blocked target reachable')}catch(error){if(error.message==='blocked target reachable')throw error}}",
  ].join('');
  try {
    await writeFile(
      path.join(directory, 'Dockerfile'),
      `FROM node:22-bookworm-slim\nRUN node ${JSON.stringify(script)}\n`,
      { mode: 0o600 },
    );
    await run(
      'docker',
      [
        'buildx',
        'build',
        '--builder',
        config.builderName,
        '--no-cache',
        '--output',
        'type=cacheonly',
        directory,
      ],
      { timeout: 180_000 },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function evidenceRecord(fixture, deployment, result, details = {}) {
  return {
    fixtureId: fixture.id,
    sourceSha: deployment?.commitSha,
    projectId: deployment?.projectId?.toString(),
    deploymentId: deployment?._id?.toString(),
    strategy: fixture.buildStrategy,
    digest: deployment?.imageDigest,
    timings: {
      startedAt: deployment?.startedAt?.toISOString?.(),
      completedAt: deployment?.completedAt?.toISOString?.(),
    },
    routeStatus: details.route?.status,
    resourceObservations: details.isolation,
    result,
  };
}

async function runSafeSuites(context, fixtureEntries, services) {
  const records = [];
  const resilienceIds = new Set(['rollback-marker', 'build-failure', 'health-failure']);
  const baselineDeployments = new Map();

  report('bootstrapping exact-SHA healthy resilience baselines');
  for (const entry of fixtureEntries.filter(({ fixture }) => resilienceIds.has(fixture.id))) {
    const id = await createExactDeployment(entry.project, context.config.baselineSha, services);
    const deployment = await waitForDeployment(context.database.Deployment, id);
    if (deployment.status !== 'HEALTHY') {
      throw new Error(`${entry.fixture.id} baseline did not become healthy.`);
    }
    baselineDeployments.set(entry.fixture.id, deployment);
  }

  const safeEntries = fixtureEntries.filter(
    ({ fixture }) => !['slow-build', 'resource-pressure'].includes(fixture.id),
  );
  for (const entry of safeEntries) {
    report(`deploying candidate fixture ${entry.fixture.id}`);
    try {
      const deploymentId = await triggerHook(entry.protectedProject);
      const deployment = await waitForDeployment(context.database.Deployment, deploymentId);
      const expectsFailure = ['build-failure', 'health-failure'].includes(entry.fixture.id);
      if (expectsFailure) {
        if (deployment.status !== 'FAILED') {
          throw new Error(`${entry.fixture.id} was expected to fail safely.`);
        }
        const active = await context.database.Project.findById(entry.project._id)
          .select('activeDeploymentId')
          .lean();
        if (
          active.activeDeploymentId?.toString() !==
          baselineDeployments.get(entry.fixture.id)._id.toString()
        ) {
          throw new Error(`${entry.fixture.id} replaced the previous healthy release.`);
        }
        await assertDeploymentEvents(context.database, deployment._id, [
          context.config.privateCanary,
        ]);
        records.push(evidenceRecord(entry.fixture, deployment, 'pass'));
        continue;
      }
      const details = await verifyHealthyFixture(context, entry, deployment);
      records.push(evidenceRecord(entry.fixture, deployment, 'pass', details));
    } catch (error) {
      records.push({
        fixtureId: entry.fixture.id,
        strategy: entry.fixture.buildStrategy,
        result: 'fail',
      });
      throw error;
    }
  }

  report('verifying retained-digest rollback');
  const rollbackEntry = fixtureEntries.find(({ fixture }) => fixture.id === 'rollback-marker');
  const baseline = baselineDeployments.get('rollback-marker');
  const rollbackResult = await services.rollbackDeployment(
    rollbackEntry.project._id,
    baseline._id,
    rollbackEntry.project.ownerId,
  );
  if (!rollbackResult.success) {
    throw new Error(`Rollback was refused: ${rollbackResult.error}`);
  }
  const rollback = await waitForDeployment(
    context.database.Deployment,
    rollbackResult.deployment._id,
  );
  if (rollback.status !== 'HEALTHY' || rollback.imageDigest !== baseline.imageDigest) {
    throw new Error('Rollback did not reactivate the retained baseline digest.');
  }
  const rollbackRoute = await checkRoute(
    new URL(rollbackEntry.fixture.probePath, rollbackEntry.protectedProject.routeUrl),
    { marker: 'baseline-v1' },
  );
  if (!rollbackRoute.ok || !rollbackRoute.markerFound) {
    throw new Error('Rollback route did not expose the baseline marker.');
  }
  await runBrowserAndStreamingChecks(context.config);
  await runBuildkitEgressProbe(context.config);
  return records;
}

async function runSlowBuildScenario(context, entry, services, mode) {
  const deploymentId = await triggerHook(entry.protectedProject);
  const building = await pollUntil(
    () => context.database.Deployment.findById(deploymentId).lean(),
    (deployment) => deployment?.status === 'BUILDING' || TERMINAL_STATUSES.has(deployment?.status),
    { timeoutMs: DEPLOY_TIMEOUT_MS, intervalMs: 1500 },
  );
  if (building.status !== 'BUILDING') {
    throw new Error(`Slow build reached ${building.status} before the ${mode} checkpoint.`);
  }
  if (mode === 'cancellation') {
    const result = await services.cancelDeployment(
      deploymentId,
      entry.project._id,
      entry.project.ownerId,
    );
    if (!result.success) {
      throw new Error(`Cancellation failed: ${result.error}`);
    }
    return waitForDeployment(context.database.Deployment, deploymentId, DEPLOY_TIMEOUT_MS);
  }
  if (mode === 'worker-interruption') {
    report(
      `CHECKPOINT worker-interruption deployment=${deploymentId}; restart the nonproduction worker now`,
    );
  }
  return waitForDeployment(context.database.Deployment, deploymentId, BUILD_TIMEOUT_MS);
}

async function runDisruptiveSuites(context, entries, services, options) {
  const records = [];
  const slow = entries.find(({ fixture }) => fixture.id === 'slow-build');
  if (options.withCancellation) {
    const deployment = await runSlowBuildScenario(context, slow, services, 'cancellation');
    if (deployment.status !== 'CANCELLED') {
      throw new Error('Cancellation scenario did not finish CANCELLED.');
    }
    records.push(evidenceRecord(slow.fixture, deployment, 'pass'));
  }
  if (options.withTimeout) {
    const deployment = await runSlowBuildScenario(context, slow, services, 'timeout');
    if (
      deployment.status !== 'FAILED' ||
      !/(?:timed?\s*out|timeout)/i.test(
        `${deployment.failureCode ?? ''} ${deployment.failureSummary ?? ''}`,
      )
    ) {
      throw new Error('Timeout scenario did not fail with a timeout code.');
    }
    records.push(evidenceRecord(slow.fixture, deployment, 'pass'));
  }
  if (options.withWorkerInterruption) {
    const deployment = await runSlowBuildScenario(context, slow, services, 'worker-interruption');
    if (!TERMINAL_STATUSES.has(deployment.status)) {
      throw new Error('Worker interruption scenario did not recover to a terminal state.');
    }
    records.push(evidenceRecord(slow.fixture, deployment, 'pass'));
  }
  if (options.withResourcePressure) {
    const entry = entries.find(({ fixture }) => fixture.id === 'resource-pressure');
    const id = await triggerHook(entry.protectedProject);
    const deployment = await waitForDeployment(context.database.Deployment, id);
    const details = await verifyHealthyFixture(context, entry, deployment);
    const pressure = await checkRoute(new URL('/pressure', entry.protectedProject.routeUrl));
    if (!pressure.ok) {
      throw new Error('Bounded resource-pressure route failed.');
    }
    records.push(evidenceRecord(entry.fixture, deployment, 'pass', details));
  }
  if (options.withRegistryCleanup) {
    const entry = entries.find(({ fixture }) => fixture.id === 'registry-cleanup');
    const quota = await context.database.resolveProjectQuota(
      entry.project._id,
      entry.project.ownerId,
    );
    if (quota.maxRollbackReleases !== 1) {
      throw new Error('Registry cleanup fixture project must have maxRollbackReleases=1.');
    }
    const baselineId = await createExactDeployment(
      entry.project,
      context.config.baselineSha,
      services,
    );
    const baseline = await waitForDeployment(context.database.Deployment, baselineId);
    const candidateId = await triggerHook(entry.protectedProject);
    const candidate = await waitForDeployment(context.database.Deployment, candidateId);
    await pollUntil(
      async () => {
        try {
          await run('oras', ['manifest', 'fetch', baseline.imageRef], { timeout: 30_000 });
          return false;
        } catch {
          return true;
        }
      },
      Boolean,
      { timeoutMs: 120_000, intervalMs: 5000 },
    );
    await run('oras', ['manifest', 'fetch', candidate.imageRef], { timeout: 30_000 });
    records.push(evidenceRecord(entry.fixture, candidate, 'pass'));
  }
  return records;
}

async function writeEvidence(outputDirectory, evidence, prohibitedValues) {
  const sanitized = sanitizeEvidence(evidence, prohibitedValues);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const stem = `multi-runtime-${new Date().toISOString().replaceAll(':', '-')}`;
  const jsonPath = path.join(outputDirectory, `${stem}.json`);
  const markdownPath = path.join(outputDirectory, `${stem}.md`);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 }),
    writeFile(markdownPath, renderEvidenceMarkdown(sanitized), { mode: 0o600 }),
  ]);
  return { jsonPath, markdownPath };
}

async function main() {
  const options = parseAcceptanceArguments(process.argv.slice(2));
  const { config, manifest } = await loadProtectedInputs(options);
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI must be installed in the protected operator environment.');
  }

  const database = await import('@hellodeploy/database');
  await database.connectDatabase(process.env.MONGODB_URI);
  const environmentSetting = await database.PlatformSetting.findOne({
    key: 'deployment-environment',
  }).lean();
  assertAcceptanceEnvironment(environmentSetting?.value, config.confirmationId);
  const queueClient = await import('../apps/web/src/queue/client.js');
  try {
    const entries = await runPreflight(config, manifest, database, queueClient);
    if (!options.execute) {
      report('preflight passed; no deployment mutations were performed');
      return;
    }

    const deploymentService = await import('../apps/web/src/services/deployment.service.js');
    const { DeploymentTrigger } = await import('@hellodeploy/contracts');
    const services = { ...deploymentService, DeploymentTrigger };
    const startedAt = new Date().toISOString();
    const context = { config, manifest, database };
    const fixtures = [
      ...(await runSafeSuites(context, entries, services)),
      ...(await runDisruptiveSuites(context, entries, services, options)),
    ];
    const evidence = {
      schemaVersion: 1,
      environmentClass: 'nonproduction',
      startedAt,
      completedAt: new Date().toISOString(),
      result: fixtures.every((fixture) => fixture.result === 'pass') ? 'pass' : 'fail',
      fixtures,
    };
    const written = await writeEvidence(options.evidenceOutput, evidence, [config.privateCanary]);
    report(
      `acceptance passed; sanitized evidence written to ${written.jsonPath} and ${written.markdownPath}`,
    );
  } finally {
    await queueClient.closeDeploymentQueue();
    await database.disconnectDatabase();
  }
}

main().catch((error) => {
  process.stderr.write(`[multi-runtime] failed: ${error.message}\n`);
  process.exitCode = 1;
});
