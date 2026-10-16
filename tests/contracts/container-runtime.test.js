import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BuildStrategy,
  RuntimeType,
  findDockerfilePolicyViolations,
  getBuildStrategyRuntime,
  isContainerBuildStrategy,
  isNonRootImageUser,
  isPilotStrategyEnabledFor,
  parseImageReference,
  validateDockerfilePath,
} from '@hellodeploy/contracts';

const DIGEST = `sha256:${'b'.repeat(64)}`;
const messages = (content) => findDockerfilePolicyViolations(content).map((v) => v.message);

describe('container build strategies', () => {
  it('recognizes the Dockerfile and OCI image strategies', () => {
    assert.deepEqual(
      [BuildStrategy.DOCKERFILE_V1, BuildStrategy.OCI_IMAGE_V1].map(isContainerBuildStrategy),
      [true, true],
    );
  });

  it('binds both strategies to the CONTAINER runtime', () => {
    assert.equal(getBuildStrategyRuntime(BuildStrategy.OCI_IMAGE_V1), RuntimeType.CONTAINER);
  });

  it('enables the Dockerfile and OCI strategies through separate pilots', () => {
    const pilots = {
      dockerfile: { enabled: true, projectIds: new Set(['p1']) },
      oci: { enabled: false, projectIds: new Set(['p1']) },
    };
    assert.deepEqual(
      [
        isPilotStrategyEnabledFor(BuildStrategy.DOCKERFILE_V1, 'p1', pilots),
        isPilotStrategyEnabledFor(BuildStrategy.OCI_IMAGE_V1, 'p1', pilots),
      ],
      [true, false],
    );
  });
});

describe('parseImageReference', () => {
  it('expands a Docker Hub official image to its full name', () => {
    assert.deepEqual(parseImageReference('nginx:1.27'), {
      registry: 'docker.io',
      repository: 'library/nginx',
      tag: '1.27',
      digest: null,
      name: 'docker.io/library/nginx',
      error: null,
    });
  });

  it('keeps a GHCR digest reference pinned', () => {
    const parsed = parseImageReference(`ghcr.io/owner/app@${DIGEST}`);
    assert.deepEqual([parsed.registry, parsed.digest, parsed.tag], ['ghcr.io', DIGEST, null]);
  });

  it('treats a missing tag and digest as latest', () => {
    assert.equal(parseImageReference('owner/app').tag, 'latest');
  });

  it('rejects a registry outside the approved list', () => {
    assert.match(parseImageReference('quay.io/owner/app:1').error, /docker\.io, ghcr\.io/);
  });

  it('rejects uppercase repository names', () => {
    assert.match(parseImageReference('Owner/App:1').error, /image reference/);
  });

  it('rejects shell syntax', () => {
    assert.match(parseImageReference('nginx;id').error, /image reference/);
  });

  it('rejects a digest that is not sha256', () => {
    assert.match(parseImageReference(`nginx@md5:${'a'.repeat(32)}`).error, /image reference/);
  });
});

describe('validateDockerfilePath', () => {
  it('accepts a nested Dockerfile path', () => {
    assert.equal(validateDockerfilePath('docker/web.Dockerfile'), null);
  });

  it('rejects traversal', () => {
    assert.match(validateDockerfilePath('../Dockerfile'), /traversal/);
  });

  it('rejects the application root itself', () => {
    assert.match(validateDockerfilePath('.'), /file/);
  });
});

describe('findDockerfilePolicyViolations', () => {
  const ok = 'FROM node:22-slim\nUSER node\nCMD ["node", "server.js"]\n';

  it('accepts a plain Dockerfile with a non-root user', () => {
    assert.deepEqual(findDockerfilePolicyViolations(ok), []);
  });

  it('rejects a custom BuildKit frontend', () => {
    assert.match(messages(`# syntax=evil.example/frontend\n${ok}`)[0], /frontend/);
  });

  it('accepts the official Dockerfile frontend', () => {
    assert.deepEqual(findDockerfilePolicyViolations(`# syntax=docker/dockerfile:1.7\n${ok}`), []);
  });

  it('rejects an insecure RUN', () => {
    assert.match(
      messages(`FROM node:22-slim\nRUN --security=insecure id\nUSER node\n`)[0],
      /insecure/,
    );
  });

  it('rejects host networking, including across a line continuation', () => {
    assert.match(
      messages('FROM node:22-slim\nRUN \\\n  --network=host curl x\nUSER node\n')[0],
      /host network/,
    );
  });

  it('rejects SSH and secret mounts', () => {
    assert.equal(
      messages(
        'FROM node:22-slim\nRUN --mount=type=ssh id\nRUN --mount=type=secret,id=a id\nUSER node\n',
      ).length,
      2,
    );
  });

  it('rejects VOLUME, which creates unmanaged storage on the host', () => {
    assert.match(messages('FROM node:22-slim\nVOLUME /data\nUSER node\n')[0], /VOLUME/);
  });

  it('rejects a base image from an unapproved registry', () => {
    assert.match(messages('FROM quay.io/owner/base:1\nUSER app\n')[0], /docker\.io, ghcr\.io/);
  });

  it('accepts a later stage built from an earlier one', () => {
    assert.deepEqual(
      findDockerfilePolicyViolations(
        'FROM node:22-slim AS build\nRUN npm ci\nFROM build\nUSER node\n',
      ),
      [],
    );
  });

  it('checks a base image named through a global ARG default', () => {
    assert.match(
      // eslint-disable-next-line no-template-curly-in-string -- Dockerfile syntax, not JavaScript.
      messages('ARG BASE=quay.io/owner/base:1\nFROM ${BASE}\nUSER app\n')[0],
      /docker\.io, ghcr\.io/,
    );
  });

  it('accepts an approved base image named through a global ARG default', () => {
    assert.deepEqual(
      // eslint-disable-next-line no-template-curly-in-string -- Dockerfile syntax, not JavaScript.
      findDockerfilePolicyViolations('ARG NODE=22\nFROM node:${NODE}-slim\nUSER node\n'),
      [],
    );
  });

  it('rejects a base image whose ARG has no default', () => {
    assert.match(messages('ARG BASE\nFROM $BASE\nUSER app\n')[0], /ARG default/);
  });

  it('requires the final stage to switch to a non-root user', () => {
    assert.match(messages('FROM node:22-slim\nUSER node\nFROM nginx:1\n')[0], /non-root USER/);
  });

  it('rejects USER root in the final stage', () => {
    assert.match(messages('FROM node:22-slim\nUSER root\n')[0], /non-root USER/);
  });

  it('reports the line of each violation', () => {
    assert.equal(findDockerfilePolicyViolations('FROM node:22\nVOLUME /x\nUSER node\n')[0].line, 2);
  });
});

describe('isNonRootImageUser', () => {
  it('rejects an empty user, root, and uid 0', () => {
    assert.deepEqual(['', 'root', '0', '0:0', 'root:app'].map(isNonRootImageUser), [
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('accepts a named or numeric non-root user', () => {
    assert.deepEqual(['node', '10001', '10001:10001', 'app:app'].map(isNonRootImageUser), [
      true,
      true,
      true,
      true,
    ]);
  });
});
