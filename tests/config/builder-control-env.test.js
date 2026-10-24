import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const validator = new URL('../../scripts/validate-config.js', import.meta.url).pathname;
const baseEnv = {
  ...process.env,
  NODE_ENV: 'production',
  REDIS_URL: '',
  NGINX_ENABLED: 'true',
  SESSION_SECRET: 's'.repeat(64),
  PLATFORM_DOMAIN: 'hellodeploy.example.test',
  DEPLOYMENT_DOMAIN: 'apps.hellodeploy.example.test',
  PLATFORM_SUBDOMAIN_SUFFIX: '.apps.hellodeploy.example.test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/hellodeploy-test',
  HELLODEPLOY_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
  GITHUB_APP_ID: '',
  GITHUB_APP_NAME: '',
  GITHUB_APP_PRIVATE_KEY_PATH: '',
  GITHUB_APP_PRIVATE_KEY: '',
  GITHUB_WEBHOOK_SECRET: '',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  RESEND_WEBHOOK_SECRET: '',
  TURNSTILE_SITE_KEY: '',
  TURNSTILE_SECRET_KEY: '',
  CLOUDFLARE_API_TOKEN: '',
  CLOUDFLARE_ZONE_ID: '',
  CUSTOM_HOSTNAME_TARGET: '',
};
const BUILDER_ENV = {
  BUILD_EXECUTOR: 'local',
  BUILD_BUILDER_NAME: 'hellodeploy-builder',
  BUILDER_CONTROL_ENABLED: 'true',
  BUILDER_CONTROL_BUILDX_NAME: 'hellodeploy-ondemand',
  BUILDER_CONTROL_ENDPOINT: 'unix:///run/hellodeploy-builder/buildkitd.sock',
  USER_IMAGE_REGISTRY: 'ghcr.io/4hprojects/hellodeploy-builds',
  REGISTRY_MANIFEST_DELETE_ENABLED: 'true',
  WORKER_CONCURRENCY: '1',
};

function validate(component, overrides) {
  return spawnSync(process.execPath, [validator, '--component', component, '--json'], {
    encoding: 'utf8',
    env: { ...baseEnv, ...overrides },
  });
}

describe('builder control configuration', () => {
  it('is off when nothing is set', () => {
    const result = validate('worker', {});
    assert.equal(result.status, 0, result.stdout || result.stderr);
  });

  it('accepts a complete builder configuration with the Next.js pilot', () => {
    const result = validate('worker', {
      ...BUILDER_ENV,
      MULTIRUNTIME_NEXT_V1_ENABLED: 'true',
      MULTIRUNTIME_NEXT_V1_PROJECT_IDS: '507f1f77bcf86cd799439011',
    });
    assert.equal(result.status, 0, result.stdout || result.stderr);
  });

  it('refuses the production Docker daemon socket as the builder address', () => {
    const result = validate('worker', {
      ...BUILDER_ENV,
      BUILDER_CONTROL_ENDPOINT: 'unix:///var/run/docker.sock',
    });
    assert.match(result.stdout, /not the Docker daemon socket/);
  });

  it('refuses a builder name shared with the legacy Node builder', () => {
    const result = validate('worker', {
      ...BUILDER_ENV,
      BUILDER_CONTROL_BUILDX_NAME: 'hellodeploy-builder',
    });
    assert.match(result.stdout, /must differ from BUILD_BUILDER_NAME/);
  });

  it('refuses running builder control and the remote executor together', () => {
    const result = validate('worker', {
      ...BUILDER_ENV,
      BUILD_EXECUTOR: 'remote-buildkit',
    });
    assert.match(result.stdout, /separate build paths/);
  });

  it('refuses a unit outside the hellodeploy service namespace', () => {
    const result = validate('worker', { ...BUILDER_ENV, BUILDER_CONTROL_UNIT: 'docker.service' });
    assert.match(result.stdout, /BUILDER_CONTROL_UNIT/);
  });

  it('requires one job at a time', () => {
    const result = validate('worker', { ...BUILDER_ENV, WORKER_CONCURRENCY: '2' });
    assert.match(result.stdout, /BUILDER_CONTROL_ENABLED requires WORKER_CONCURRENCY=1/);
  });

  it('keeps owner Dockerfiles off on the worker while builder control is on', () => {
    const result = validate('worker', {
      ...BUILDER_ENV,
      IMAGE_SCANNER: 'trivy',
      MULTIRUNTIME_DOCKERFILE_V1_ENABLED: 'true',
      MULTIRUNTIME_DOCKERFILE_V1_PROJECT_IDS: '507f1f77bcf86cd799439011',
    });
    assert.match(result.stdout, /must not be combined with MULTIRUNTIME_DOCKERFILE_V1_ENABLED/);
  });

  it('keeps prebuilt images off on the web while builder control is on', () => {
    const result = validate('web', {
      BUILDER_CONTROL_ENABLED: 'true',
      MULTIRUNTIME_OCI_V1_ENABLED: 'true',
      MULTIRUNTIME_OCI_V1_PROJECT_IDS: '507f1f77bcf86cd799439011',
    });
    assert.match(result.stdout, /must not be combined with/);
  });
});
