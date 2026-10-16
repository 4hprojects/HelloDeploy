import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import {
  LEGACY_PRODUCTION_ENVIRONMENT,
  isNonproductionEnvironmentMarker,
} from '@hellodeploy/contracts';
import { buildSecretAad, decrypt } from '@hellodeploy/security';

export const ACCEPTANCE_SCHEMA_VERSION = 1;
export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const IN_FLIGHT_STATUSES = new Set(['QUEUED', 'VALIDATING', 'BUILDING', 'DEPLOYING']);
export const TERMINAL_STATUSES = new Set(['HEALTHY', 'FAILED', 'CANCELLED']);
export const DISRUPTIVE_FLAGS = Object.freeze([
  'withCancellation',
  'withTimeout',
  'withWorkerInterruption',
  'withResourcePressure',
  'withRegistryCleanup',
]);

const CLI_FLAG_MAP = Object.freeze({
  '--with-cancellation': 'withCancellation',
  '--with-timeout': 'withTimeout',
  '--with-worker-interruption': 'withWorkerInterruption',
  '--with-resource-pressure': 'withResourcePressure',
  '--with-registry-cleanup': 'withRegistryCleanup',
});

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|canary|hook|connection|string|hostname|uri|url|raw|log)/i;
const CREDENTIAL_PATTERN =
  /(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|https?:\/\/[^\s/@:]+:[^\s/@]+@|mongodb(?:\+srv)?:\/\/|redis:\/\/)/i;

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function parseAcceptanceArguments(args) {
  const options = {
    execute: false,
    withCancellation: false,
    withTimeout: false,
    withWorkerInterruption: false,
    withResourcePressure: false,
    withRegistryCleanup: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--config') {
      options.configPath = requireValue(args, index, argument);
      index += 1;
    } else if (argument === '--confirm-environment') {
      options.confirmEnvironment = requireValue(args, index, argument);
      index += 1;
    } else if (argument === '--evidence-output') {
      options.evidenceOutput = requireValue(args, index, argument);
      index += 1;
    } else if (argument === '--execute') {
      options.execute = true;
    } else if (CLI_FLAG_MAP[argument]) {
      options[CLI_FLAG_MAP[argument]] = true;
    } else {
      throw new Error(`Unknown acceptance option: ${argument}`);
    }
  }

  if (!options.configPath || !path.isAbsolute(options.configPath)) {
    throw new Error('--config must be an absolute path to the protected configuration.');
  }
  if (options.evidenceOutput && !path.isAbsolute(options.evidenceOutput)) {
    throw new Error('--evidence-output must be an absolute path.');
  }
  if (DISRUPTIVE_FLAGS.some((flag) => options[flag]) && !options.execute) {
    throw new Error('Disruptive scenario flags require --execute.');
  }
  if (options.execute && !options.evidenceOutput) {
    throw new Error('--evidence-output is required with --execute.');
  }
  return options;
}

function requireHttps(value, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`${field} must be an HTTPS URL without embedded credentials.`);
  }
  return parsed;
}

export function validateFixtureManifest(manifest) {
  if (manifest?.schemaVersion !== ACCEPTANCE_SCHEMA_VERSION || !Array.isArray(manifest.fixtures)) {
    throw new Error('Fixture manifest schemaVersion 1 and fixtures are required.');
  }
  const ids = new Set();
  for (const fixture of manifest.fixtures) {
    if (!/^[a-z0-9-]+$/.test(fixture?.id ?? '') || ids.has(fixture.id)) {
      throw new Error(`Fixture id is invalid or duplicated: ${fixture?.id ?? '<missing>'}`);
    }
    ids.add(fixture.id);
    if (
      typeof fixture.applicationRoot !== 'string' ||
      !fixture.applicationRoot.startsWith('tests/fixtures/multi-runtime/') ||
      path.posix.normalize(fixture.applicationRoot) !== fixture.applicationRoot ||
      fixture.applicationRoot.includes('..')
    ) {
      throw new Error(`Fixture ${fixture.id} has an unsafe applicationRoot.`);
    }
    if (!fixture.runtimeType || !fixture.buildStrategy || !fixture.probePath?.startsWith('/')) {
      throw new Error(`Fixture ${fixture.id} is missing runtime expectations.`);
    }
  }
  return manifest;
}

export function validateAcceptanceConfig(config, manifest, options = {}) {
  if (options.nodeEnv === 'production') {
    throw new Error('The acceptance harness refuses NODE_ENV=production.');
  }
  if (config?.schemaVersion !== ACCEPTANCE_SCHEMA_VERSION) {
    throw new Error('Acceptance configuration schemaVersion must be 1.');
  }
  if (config.environmentClass !== 'nonproduction') {
    throw new Error('environmentClass must be exactly "nonproduction".');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(config.confirmationId ?? '')) {
    throw new Error('confirmationId must be a unique nonproduction identifier.');
  }
  if (options.execute && options.confirmEnvironment !== config.confirmationId) {
    throw new Error('The environment confirmation id does not match the protected configuration.');
  }
  requireHttps(config.platformBaseUrl, 'platformBaseUrl');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.fixtureRepository ?? '')) {
    throw new Error('fixtureRepository must use owner/repository form.');
  }
  for (const field of ['baselineSha', 'candidateSha']) {
    if (!FULL_SHA_PATTERN.test(config[field] ?? '')) {
      throw new Error(`${field} must be a full lowercase 40-character SHA.`);
    }
  }
  if (config.baselineSha === config.candidateSha) {
    throw new Error('baselineSha and candidateSha must differ.');
  }
  if (typeof config.builderName !== 'string' || config.builderName.trim().length === 0) {
    throw new Error('builderName is required.');
  }
  if (!/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_./-]+$/i.test(config.ghcrRepository ?? '')) {
    throw new Error('ghcrRepository must be a GHCR repository reference without a tag.');
  }
  if (typeof config.privateCanary !== 'string' || config.privateCanary.length < 16) {
    throw new Error('privateCanary must contain at least 16 characters.');
  }
  if (!Array.isArray(config.controlPlaneTargets) || config.controlPlaneTargets.length === 0) {
    throw new Error('At least one named controlPlaneTarget is required.');
  }
  for (const [index, target] of config.controlPlaneTargets.entries()) {
    if (!/^[a-z0-9-]+$/.test(target?.name ?? '')) {
      throw new Error(`controlPlaneTargets[${index}].name is invalid.`);
    }
    requireHttps(target.url, `controlPlaneTargets[${index}].url`);
  }

  if (!Array.isArray(config.projects)) {
    throw new Error('projects must be an array.');
  }
  const projectByFixture = new Map();
  for (const [index, project] of config.projects.entries()) {
    if (projectByFixture.has(project.fixtureId)) {
      throw new Error(`Duplicate project fixtureId: ${project.fixtureId}`);
    }
    if (!/^[0-9a-f]{24}$/.test(project.projectId ?? '')) {
      throw new Error(`projects[${index}].projectId must be a MongoDB object id.`);
    }
    const hook = requireHttps(project.deployHookUrl, `projects[${index}].deployHookUrl`);
    if (!hook.pathname.startsWith(`/api/deploy-hooks/${project.projectId}/`)) {
      throw new Error(`projects[${index}].deployHookUrl does not match projectId.`);
    }
    requireHttps(project.routeUrl, `projects[${index}].routeUrl`);
    projectByFixture.set(project.fixtureId, project);
  }

  for (const fixture of manifest.fixtures) {
    const project = projectByFixture.get(fixture.id);
    if (!project) {
      throw new Error(`Missing protected project configuration for fixture ${fixture.id}.`);
    }
    if (
      project.expectedStrategy !== fixture.buildStrategy ||
      project.expectedApplicationRoot !== fixture.applicationRoot
    ) {
      throw new Error(`Project expectations do not match fixture ${fixture.id}.`);
    }
  }
  return config;
}

export function assertAcceptanceEnvironment(marker, confirmationId) {
  if (marker === LEGACY_PRODUCTION_ENVIRONMENT) {
    throw new Error('Acceptance refuses a production database.');
  }
  if (!isNonproductionEnvironmentMarker(marker)) {
    throw new Error('Acceptance requires a registered nonproduction database.');
  }
  if (marker.environmentId !== confirmationId) {
    throw new Error('Acceptance environment identity does not match the protected configuration.');
  }
  return marker;
}

export function assertPrivateCanary(record, expectedValue, decryptImpl = decrypt) {
  const failure = () => new Error('Private-secret fixture canary is missing or does not match.');
  if (!record || typeof expectedValue !== 'string') {
    throw failure();
  }
  try {
    const actualValue = decryptImpl({
      ciphertext: record.ciphertext,
      iv: record.iv,
      authTag: record.authTag,
      version: record.encryptionVersion,
      aad: record.aadBound
        ? buildSecretAad({ projectId: record.projectId, name: record.name })
        : undefined,
    });
    const actual = Buffer.from(actualValue, 'utf8');
    const expected = Buffer.from(expectedValue, 'utf8');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw failure();
    }
  } catch {
    throw failure();
  }
  return true;
}

export function assertProtectedConfigMode(stat) {
  if (!stat?.isFile?.()) {
    throw new Error('Protected configuration must be a regular file.');
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('Protected configuration must not be readable or writable by group or others.');
  }
}

export async function pollUntil(read, predicate, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 2000;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + timeoutMs;
  let value;
  do {
    value = await read();
    if (predicate(value)) {
      return value;
    }
    if (now() >= deadline) {
      break;
    }
    await sleep(intervalMs);
  } while (now() <= deadline);
  throw new Error('Timed out waiting for the bounded acceptance condition.');
}

export async function checkRoute(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });
  const body = await response.text();
  return {
    ok: response.status >= 200 && response.status < 400,
    status: response.status,
    markerFound: options.marker ? body.includes(options.marker) : true,
  };
}

export async function measureStreaming(url, options = {}) {
  const now = options.now ?? (() => performance.now());
  const fetchImpl = options.fetchImpl ?? fetch;
  const startedAt = now();
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Streaming route returned ${response.status}.`);
  }
  const reader = response.body.getReader();
  const first = await reader.read();
  const firstChunkMs = now() - startedAt;
  while (!(await reader.read()).done) {
    // Drain the response so total duration proves that the first chunk arrived early.
  }
  const totalMs = now() - startedAt;
  return { firstChunkMs, totalMs, deliveredEarly: !first.done && firstChunkMs < totalMs };
}

export function evaluateDockerInspect(inspect, limits = {}) {
  const host = inspect?.HostConfig ?? {};
  const config = inspect?.Config ?? {};
  const bindings = host.PortBindings ?? {};
  const loopbackOnly = Object.values(bindings)
    .flat()
    .every((binding) => binding?.HostIp === '127.0.0.1');
  const capDrop = new Set(host.CapDrop ?? []);
  const securityOptions = new Set(host.SecurityOpt ?? []);
  const mounts = inspect?.Mounts ?? [];
  return {
    nonRoot: Boolean(config.User && config.User !== '0' && config.User !== 'root'),
    loopbackOnly,
    allCapabilitiesDropped: capDrop.has('ALL'),
    noNewPrivileges: securityOptions.has('no-new-privileges'),
    nonHostNetwork: host.NetworkMode !== 'host',
    noDockerSocket: !mounts.some((mount) => mount.Source === '/var/run/docker.sock'),
    pidLimited: Number(host.PidsLimit) > 0,
    cpuLimited: Number(host.NanoCpus) > 0 || Number(host.CpuQuota) > 0,
    memoryLimited: Number(host.Memory) > 0,
    readOnlyRootFilesystem: limits.requireReadOnly ? host.ReadonlyRootfs === true : true,
  };
}

export function assertImmutableDeployment(deployment, project, fixture) {
  if (!DIGEST_PATTERN.test(deployment.imageDigest ?? '')) {
    throw new Error(`${fixture.id} has no immutable image digest.`);
  }
  if (deployment.imageRef !== `${deployment.imageRef?.split('@')[0]}@${deployment.imageDigest}`) {
    throw new Error(`${fixture.id} was not activated by digest.`);
  }
  const snapshot = deployment.configurationSnapshot;
  if (
    snapshot?.sourceCommit !== deployment.commitSha ||
    snapshot?.buildStrategy !== fixture.buildStrategy ||
    snapshot?.buildConfiguration?.applicationRoot !== fixture.applicationRoot ||
    snapshot?.environmentVersion !== project.environmentVersion
  ) {
    throw new Error(`${fixture.id} has a stale or mismatched configuration snapshot.`);
  }
}

export function findSensitiveText(value, prohibitedValues = []) {
  const text = String(value ?? '');
  if (CREDENTIAL_PATTERN.test(text)) {
    return true;
  }
  return prohibitedValues.filter(Boolean).some((secret) => text.includes(secret));
}

export function sanitizeEvidence(value, prohibitedValues = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeEvidence(entry, prohibitedValues));
  }
  if (!value || typeof value !== 'object') {
    const text = String(value ?? '');
    return findSensitiveText(text, prohibitedValues) ? '[REDACTED]' : value;
  }
  const clean = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    clean[key] = sanitizeEvidence(entry, prohibitedValues);
  }
  return clean;
}

export function renderEvidenceMarkdown(evidence) {
  const lines = [
    '# Multi-Runtime Nonproduction Acceptance Evidence',
    '',
    `- Result: ${evidence.result}`,
    `- Started: ${evidence.startedAt}`,
    `- Completed: ${evidence.completedAt}`,
    '',
    '| Fixture | Result | Deployment | Strategy | Digest | Route |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const fixture of evidence.fixtures ?? []) {
    lines.push(
      `| ${fixture.fixtureId} | ${fixture.result} | ${fixture.deploymentId ?? 'n/a'} | ${fixture.strategy ?? 'n/a'} | ${fixture.digest ?? 'n/a'} | ${fixture.routeStatus ?? 'n/a'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
