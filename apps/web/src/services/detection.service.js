import { Project, Repository } from '@hellodeploy/database';
import {
  RuntimeType,
  AuditOutcome,
  RepositorySourceType,
  DetectionStatus,
  PLATFORM_MANAGED_ENV_NAMES,
  BuildStrategy,
  getBuildStrategyRuntime,
  isContainerBuildStrategy,
  JAVA_PORT,
  PHP_PORT,
  normalizeApplicationRoot,
  normalizePythonPackageName,
  resolveJavaVersion,
  resolvePhpVersion,
  parsePythonRequirementNames,
  resolvePythonVersion,
  stripInlineComment,
} from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { getInstallationToken } from './github.service.js';
import { recordProductEvent } from './product-analytics.service.js';

const NEXT_OUTPUT_PATTERNS = Object.freeze({
  [BuildStrategy.NEXT_EXPORT_V1]: /\boutput\s*:\s*['"]export['"]/,
  [BuildStrategy.NEXT_STANDALONE_V1]: /\boutput\s*:\s*['"]standalone['"]/,
});

function detectNextStrategy(files) {
  const configs = [
    'next.config.js',
    'next.config.cjs',
    'next.config.mjs',
    'next.config.ts',
    'next.config.mts',
  ]
    .map((path) => files[path])
    .filter((content) => typeof content === 'string');
  // This is deliberately a static, conservative read. Removing comments avoids
  // confirming examples that are not active configuration; anything more
  // dynamic falls back to an explicit standard-mode recommendation.
  const content = configs
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const matches = Object.entries(NEXT_OUTPUT_PATTERNS).filter(([, pattern]) =>
    pattern.test(content),
  );
  const hasCustomDistDir = /\bdistDir\s*:/.test(content);
  if (matches.length === 1) {
    const [strategy] = matches[0];
    return {
      strategy,
      isAmbiguous: false,
      hasCustomDistDir,
      rationale:
        strategy === BuildStrategy.NEXT_EXPORT_V1
          ? 'Next.js output: export was found; the generated files can be served statically.'
          : 'Next.js output: standalone was found; the minimal standalone server can be used.',
    };
  }
  const isAmbiguous = matches.length > 1 || /\boutput\s*:/.test(content);
  return {
    strategy: BuildStrategy.NEXT_STANDARD_V1,
    isAmbiguous,
    hasCustomDistDir,
    rationale: isAmbiguous
      ? 'The Next.js output setting is dynamic or unsupported, so standard next start is recommended.'
      : 'No static export or standalone output setting was found, so standard next start is recommended.',
  };
}

// ─── Python detection ─────────────────────────────────────────────────────────

const PYTHON_FRAMEWORKS = Object.freeze([
  {
    name: 'Django',
    packageName: 'django',
    strategy: BuildStrategy.PYTHON_DJANGO_V1,
    server: 'gunicorn',
  },
  {
    name: 'FastAPI',
    packageName: 'fastapi',
    strategy: BuildStrategy.PYTHON_FASTAPI_V1,
    server: 'uvicorn',
  },
  {
    name: 'Flask',
    packageName: 'flask',
    strategy: BuildStrategy.PYTHON_FLASK_V1,
    server: 'gunicorn',
  },
]);

// Candidate entry files, in the order their module is suggested.
const PYTHON_ENTRY_FILES = Object.freeze([
  ['app.py', 'app'],
  ['main.py', 'main'],
  ['wsgi.py', 'wsgi'],
  ['asgi.py', 'asgi'],
  ['app/main.py', 'app.main'],
  ['app/__init__.py', 'app'],
]);
const PYTHON_ENTRY_PATHS = Object.freeze([
  'manage.py',
  ...PYTHON_ENTRY_FILES.map(([path]) => path),
]);

function hasPythonMarkers(files) {
  return Boolean(files['requirements.txt'] || files['pyproject.toml']);
}

/** Names a pyproject.toml lists, read statically; used only to recognize frameworks. */
function parsePyprojectNames(content) {
  const names = new Set();
  for (const match of String(content ?? '').matchAll(
    /["']([A-Za-z0-9][A-Za-z0-9._-]*)|^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/gm,
  )) {
    names.add(normalizePythonPackageName(match[1] ?? match[2]));
  }
  return names;
}

function suggestApplicationModule(framework, files) {
  if (framework.packageName === 'django') {
    const settings = files['manage.py']?.match(
      /DJANGO_SETTINGS_MODULE['"]\s*,\s*['"]([A-Za-z_][A-Za-z0-9_]*)\.settings['"]/,
    );
    return settings ? `${settings[1]}.wsgi:application` : null;
  }
  const constructor = framework.packageName === 'fastapi' ? 'FastAPI' : 'Flask';
  const assignment = new RegExp(`^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${constructor}\\(`, 'm');
  for (const [path, moduleName] of PYTHON_ENTRY_FILES) {
    const variable = files[path]?.match(assignment)?.[1];
    if (variable) {
      return `${moduleName}:${variable}`;
    }
  }
  return null;
}

/**
 * Recognize a Flask, FastAPI, or Django app. Returns null when the repository has
 * no Python markers, so callers fall through to their existing behavior.
 */
function detectPythonRuntime(files) {
  if (!hasPythonMarkers(files)) {
    return null;
  }
  const issues = [];
  const requirementNames = parsePythonRequirementNames(files['requirements.txt']);
  const declaredNames = new Set([
    ...requirementNames,
    ...parsePyprojectNames(files['pyproject.toml']),
  ]);
  const frameworks = PYTHON_FRAMEWORKS.filter(({ packageName }) => declaredNames.has(packageName));
  const unknown = {
    runtimeType: RuntimeType.UNKNOWN,
    buildCommand: null,
    startCommand: null,
    outputDirectory: null,
    applicationPort: null,
    isValid: false,
  };
  if (frameworks.length === 0) {
    return {
      ...unknown,
      issues: [
        {
          level: 'ERROR',
          message:
            'A Python project was found, but no supported web framework is listed. HelloDeploy supports Flask, FastAPI, and Django.',
        },
      ],
    };
  }

  const [framework] = frameworks;
  if (frameworks.length > 1) {
    issues.push({
      level: 'WARNING',
      message: `Several Python web frameworks are listed (${frameworks.map(({ name }) => name).join(', ')}). ${framework.name} was selected; choose another Python mode if that is wrong.`,
    });
  }

  if (!files['requirements.txt']) {
    issues.push({
      level: 'ERROR',
      message:
        'HelloDeploy installs Python dependencies from requirements.txt. Export one from your tool, for example uv export --format requirements-txt > requirements.txt or poetry export -f requirements.txt > requirements.txt, and commit it.',
    });
  } else {
    if (!requirementNames.has(framework.server)) {
      issues.push({
        level: 'ERROR',
        message: `${framework.name} apps are served with ${framework.server}. Add ${framework.server} to requirements.txt with a pinned version.`,
      });
    }
    const unpinned = String(files['requirements.txt'])
      .split('\n')
      .map((line) => stripInlineComment(line))
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('-'))
      .filter((line) => !/==|===|\s@\s/.test(line))
      .map((line) => line.match(/^[A-Za-z0-9][A-Za-z0-9._-]*/)?.[0])
      .filter(Boolean);
    if (unpinned.length > 0) {
      issues.push({
        level: 'WARNING',
        message: `Some requirements are not pinned with == (${unpinned.slice(0, 5).join(', ')}${unpinned.length > 5 ? ', …' : ''}), so later builds may install different versions.`,
      });
    }
  }

  const pythonVersion = resolvePythonVersion(files['.python-version'] ?? null);
  if (pythonVersion.error) {
    issues.push({ level: 'ERROR', message: pythonVersion.error });
  }

  const applicationModule = suggestApplicationModule(framework, files);
  if (!applicationModule) {
    issues.push({
      level: 'WARNING',
      message:
        framework.packageName === 'django'
          ? 'HelloDeploy could not find the Django settings module in manage.py. Enter the application module, such as mysite.wsgi:application.'
          : `HelloDeploy could not find the ${framework.name} app object. Enter the application module, such as main:app. App factories need a module-level object, for example app = create_app().`,
    });
  }
  if (framework.packageName === 'django') {
    issues.push({
      level: 'INFO',
      message:
        'Django checklist: add your HelloDeploy address to ALLOWED_HOSTS, use an external database, and run migrations yourself; HelloDeploy never runs them during a deploy. To serve static files, add WhiteNoise and set the build command to python manage.py collectstatic --noinput.',
    });
  }

  return {
    runtimeType: RuntimeType.PYTHON,
    buildCommand: null,
    startCommand: null,
    outputDirectory: null,
    applicationPort: 8000,
    applicationModule,
    issues,
    isValid: !issues.some((issue) => issue.level === 'ERROR'),
    recommendedBuildStrategy: framework.strategy,
    strategyRationale: `${framework.name} was found in the Python dependencies, so the ${framework.name} server image is recommended.`,
  };
}

// ─── PHP detection ────────────────────────────────────────────────────────────

const PHP_ENTRY_PATHS = Object.freeze([
  'composer.lock',
  'artisan',
  'public/index.php',
  'wp-settings.php',
]);

// Fetched files are strings when present; an empty index.php still counts.
const hasFile = (files, path) => typeof files[path] === 'string';

function hasPhpMarkers(files) {
  return hasFile(files, 'composer.json') || hasFile(files, 'index.php');
}

/**
 * Recognize a plain PHP site or a Laravel app. Returns null when the repository
 * has neither composer.json nor index.php.
 */
function detectPhpRuntime(files) {
  if (!hasPhpMarkers(files)) {
    return null;
  }
  const unknown = (message) => ({
    runtimeType: RuntimeType.UNKNOWN,
    buildCommand: null,
    startCommand: null,
    outputDirectory: null,
    applicationPort: null,
    issues: [{ level: 'ERROR', message }],
    isValid: false,
  });
  if (hasFile(files, 'wp-settings.php')) {
    return unknown(
      'WordPress is not supported yet. It needs persistent uploads and plugin storage, which HelloDeploy does not provide.',
    );
  }

  const issues = [];
  let composer = null;
  if (hasFile(files, 'composer.json')) {
    try {
      composer = JSON.parse(files['composer.json']);
    } catch {
      return unknown('composer.json is not valid JSON.');
    }
  }
  const isLaravel = Boolean(composer?.require?.['laravel/framework']) && hasFile(files, 'artisan');
  let documentRoot = null;
  if (isLaravel || (!hasFile(files, 'index.php') && hasFile(files, 'public/index.php'))) {
    documentRoot = 'public';
  } else if (hasFile(files, 'index.php')) {
    documentRoot = '.';
  }
  if (!documentRoot) {
    issues.push({
      level: 'ERROR',
      message:
        'No index.php was found in the repository root or the public folder. Add one so the web server has a page to run.',
    });
  }

  if (composer && !hasFile(files, 'composer.lock')) {
    issues.push({
      level: 'ERROR',
      message:
        'composer.lock was not found. Run composer install locally and commit composer.lock so every build installs the same packages.',
    });
  }
  const phpVersion = resolvePhpVersion(files['composer.json'] ?? null);
  if (phpVersion.error) {
    issues.push({ level: 'ERROR', message: phpVersion.error });
  }

  let buildCommand = null;
  if (isLaravel && files['package.json']) {
    try {
      if (JSON.parse(files['package.json']).scripts?.build) {
        buildCommand = 'npm run build';
        if (files['package-lock.json'] === null) {
          issues.push({
            level: 'ERROR',
            message:
              'Laravel frontend assets are built with npm ci, which needs package-lock.json. Commit it, or clear the build command if the app has no frontend build.',
          });
        }
      }
    } catch {
      issues.push({
        level: 'WARNING',
        message: 'package.json is not valid JSON, so frontend assets will not be built.',
      });
    }
  }

  if (documentRoot === '.') {
    issues.push({
      level: 'WARNING',
      message:
        'Every file in the repository is publicly served except dotfiles, composer files, and vendor/. Keep private files out of the repository, or move the site into a public folder.',
    });
  }
  if (isLaravel) {
    issues.push({
      level: 'INFO',
      message:
        'Laravel checklist: set APP_KEY (php artisan key:generate --show) as a HelloDeploy environment variable, use an external MySQL or MariaDB database, and run migrations yourself; HelloDeploy never runs them during a deploy. Logs go to the deployment log. Queues, the scheduler, and uploaded files that must persist are not supported.',
    });
  }

  return {
    runtimeType: RuntimeType.PHP,
    buildCommand,
    startCommand: null,
    outputDirectory: documentRoot,
    applicationPort: PHP_PORT,
    issues,
    isValid: !issues.some((issue) => issue.level === 'ERROR'),
    recommendedBuildStrategy: isLaravel ? BuildStrategy.PHP_LARAVEL_V1 : BuildStrategy.PHP_PLAIN_V1,
    strategyRationale: isLaravel
      ? 'laravel/framework and artisan were found, so the Laravel image serving public/ is recommended.'
      : `index.php was found${documentRoot === 'public' ? ' in public/' : ''}, so the plain PHP image is recommended.`,
  };
}

// ─── Java detection ───────────────────────────────────────────────────────────

const JAVA_ENTRY_PATHS = Object.freeze([
  'mvnw',
  'gradlew',
  'settings.gradle',
  'settings.gradle.kts',
]);

function hasJavaMarkers(files) {
  return (
    hasFile(files, 'pom.xml') ||
    hasFile(files, 'build.gradle') ||
    hasFile(files, 'build.gradle.kts')
  );
}

/**
 * Recognize a Spring Boot app built with the Maven or Gradle wrapper. Returns
 * null when the repository has no Maven or Gradle build file.
 */
function detectJavaRuntime(files) {
  if (!hasJavaMarkers(files)) {
    return null;
  }
  const isMaven = hasFile(files, 'pom.xml');
  const buildFile = isMaven
    ? files['pom.xml']
    : (files['build.gradle'] ?? files['build.gradle.kts']);
  const isSpringBoot = isMaven
    ? /spring-boot-starter-parent|spring-boot-maven-plugin|<groupId>\s*org\.springframework\.boot\s*<\/groupId>/.test(
        buildFile,
      )
    : /org\.springframework\.boot/.test(buildFile);
  if (!isSpringBoot) {
    return {
      runtimeType: RuntimeType.UNKNOWN,
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      applicationPort: null,
      issues: [
        {
          level: 'ERROR',
          message:
            'A Java build was found, but HelloDeploy supports only Spring Boot web apps built into an executable jar.',
        },
      ],
      isValid: false,
    };
  }

  const issues = [];
  if (isMaven && !hasFile(files, 'mvnw')) {
    issues.push({
      level: 'ERROR',
      message:
        'HelloDeploy builds with the Maven wrapper so every build uses the same Maven version. Run mvn wrapper:wrapper and commit mvnw and the .mvn folder.',
    });
  }
  if (!isMaven && !hasFile(files, 'gradlew')) {
    issues.push({
      level: 'ERROR',
      message:
        'HelloDeploy builds with the Gradle wrapper so every build uses the same Gradle version. Run gradle wrapper and commit gradlew and the gradle/wrapper folder.',
    });
  }
  const settings = files['settings.gradle'] ?? files['settings.gradle.kts'] ?? '';
  if (
    (isMaven && /<modules>/.test(buildFile)) ||
    (!isMaven && /\binclude\s*[(\s'"]/.test(settings))
  ) {
    issues.push({
      level: 'ERROR',
      message:
        'Multi-module builds are not supported yet. Deploy a single-module Spring Boot app, or move the app into its own repository.',
    });
  }
  if (isMaven && hasFile(files, 'build.gradle')) {
    issues.push({
      level: 'WARNING',
      message: 'Both pom.xml and build.gradle were found; HelloDeploy will build with Maven.',
    });
  }

  const javaVersion = resolveJavaVersion(isMaven ? { pom: buildFile } : { gradle: buildFile });
  if (javaVersion.error) {
    issues.push({ level: 'ERROR', message: javaVersion.error });
  }

  const hasActuator = /spring-boot-starter-actuator/.test(buildFile);
  if (!hasActuator) {
    issues.push({
      level: 'WARNING',
      message:
        'After each deploy the health check requests /. Make sure your app answers it, add Spring Boot Actuator, or set a different health check path.',
    });
  }
  issues.push({
    level: 'INFO',
    message:
      'Spring Boot apps usually need at least 512 MB of memory; ask an administrator to raise the project quota if the default is lower. Tests are skipped during the build, and databases must be external.',
  });

  return {
    runtimeType: RuntimeType.JAVA,
    buildCommand: null,
    startCommand: null,
    outputDirectory: null,
    applicationPort: JAVA_PORT,
    healthCheckPath: hasActuator ? '/actuator/health' : '/',
    issues,
    isValid: !issues.some((issue) => issue.level === 'ERROR'),
    recommendedBuildStrategy: isMaven ? BuildStrategy.JAVA_MAVEN_V1 : BuildStrategy.JAVA_GRADLE_V1,
    strategyRationale: `A Spring Boot ${isMaven ? 'Maven' : 'Gradle'} build was found, so HelloDeploy will build it with the project wrapper.`,
  };
}

// ─── Pure runtime analyzer ────────────────────────────────────────────────────
// Exported so tests can call it directly without any HTTP or DB interaction.

/**
 * Detect the runtime type and validate project configuration from fetched files.
 *
 * @param {{ [filename: string]: string | null }} files
 *   Keys are paths relative to repo root. Values are file content strings,
 *   or null if the file is not present in the repository.
 *
 * @returns {{
 *   runtimeType: string,
 *   buildCommand: string | null,
 *   startCommand: string | null,
 *   outputDirectory: string | null,
 *   applicationPort: number | null,
 *   issues: Array<{ level: 'ERROR' | 'WARNING' | 'INFO', message: string }>,
 *   isValid: boolean,
 * }}
 */
export function detectRuntime(files, { currentStrategy = null } = {}) {
  const nodeResult = detectNodeRuntime(files, currentStrategy);
  if (!FRONTEND_ONLY_RUNTIMES.includes(nodeResult.runtimeType)) {
    return nodeResult;
  }
  // A backend framework owns the repository when Node found only a frontend
  // build or nothing: React or Vue there is the backend's asset pipeline, and
  // serving the repository as static files would publish its source.
  const backends = [detectPhpRuntime, detectPythonRuntime, detectJavaRuntime]
    .map((detect) => detect(files))
    .filter(Boolean);
  const backend =
    backends.find((result) => result.runtimeType !== RuntimeType.UNKNOWN) ?? backends[0];
  if (
    !backend ||
    (backend.runtimeType === RuntimeType.UNKNOWN && nodeResult.runtimeType !== RuntimeType.UNKNOWN)
  ) {
    return nodeResult;
  }
  return backend;
}

const FRONTEND_ONLY_RUNTIMES = Object.freeze([
  RuntimeType.STATIC,
  RuntimeType.REACT,
  RuntimeType.VUE,
  RuntimeType.UNKNOWN,
]);

function detectNodeRuntime(files, currentStrategy) {
  const issues = [];

  // ── No package.json — static or unknown ────────────────────────────────────
  if (!files['package.json']) {
    if (files['index.html'] !== null) {
      return {
        runtimeType: RuntimeType.STATIC,
        buildCommand: null,
        startCommand: null,
        outputDirectory: '.',
        applicationPort: null,
        issues: [],
        isValid: true,
      };
    }
    issues.push({
      level: 'ERROR',
      message:
        'No package.json or index.html found. Only static (HTML) and Node.js projects are supported.',
    });
    return {
      runtimeType: RuntimeType.UNKNOWN,
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      applicationPort: null,
      issues,
      isValid: false,
    };
  }

  // ── Parse package.json ──────────────────────────────────────────────────────
  let pkg;
  try {
    pkg = JSON.parse(files['package.json']);
  } catch {
    issues.push({ level: 'ERROR', message: 'package.json is not valid JSON.' });
    return {
      runtimeType: RuntimeType.UNKNOWN,
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      applicationPort: null,
      issues,
      isValid: false,
    };
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const scripts = pkg.scripts ?? {};

  // ── Detect framework ────────────────────────────────────────────────────────

  let runtimeType;
  let buildCommand = scripts.build ?? null;
  let startCommand = scripts.start ?? null;
  let outputDirectory = null;
  let applicationPort = null;

  if ('next' in deps) {
    runtimeType = RuntimeType.NEXTJS;
    buildCommand = buildCommand ?? 'npm run build';
    const nextStrategy = detectNextStrategy(files);
    if (nextStrategy.strategy === BuildStrategy.NEXT_EXPORT_V1) {
      startCommand = null;
      outputDirectory = 'out';
      applicationPort = null;
    } else if (nextStrategy.strategy === BuildStrategy.NEXT_STANDALONE_V1) {
      startCommand = 'node server.js';
      outputDirectory = '.next';
      applicationPort = 3000;
    } else {
      startCommand = startCommand ?? 'npm start';
      outputDirectory = '.next';
      applicationPort = 3000;
      if (!scripts.start) {
        issues.push({
          level: 'WARNING',
          message:
            'Standard Next.js server mode runs npm start, but package.json has no "start" script. Add "start": "next start".',
        });
      }
      // The standard image prunes devDependencies after the build, so a next
      // listed only there is gone when npm start runs.
      if (!('next' in (pkg.dependencies ?? {}))) {
        issues.push({
          level: 'WARNING',
          message:
            'Standard Next.js server mode removes devDependencies after the build, so move "next" to dependencies in package.json.',
        });
      }
    }
    // Only the legacy image copies public/ without creating it; every Next.js
    // build mode makes or ignores the folder.
    if (
      files['public/'] === false &&
      getBuildStrategyRuntime(currentStrategy) !== RuntimeType.NEXTJS
    ) {
      issues.push({
        level: 'WARNING',
        message:
          'No public/ folder was found. The default Next.js build copies it, so the build fails without one. Add a public/ folder (an empty public/.gitkeep is enough) or ask an administrator to enable the optimized build for this project.',
      });
    }
    if (nextStrategy.hasCustomDistDir) {
      issues.push({
        level: 'WARNING',
        message:
          'A custom distDir was found in the Next.js config. HelloDeploy expects the default .next and out folders, so remove distDir before deploying.',
      });
    }
    if (nextStrategy.isAmbiguous) {
      issues.push({
        level: 'WARNING',
        message:
          'HelloDeploy could not statically confirm the Next.js output mode. Review the recommended standard-server mode before deploying.',
      });
    }
  } else if ('react-scripts' in deps) {
    runtimeType = RuntimeType.REACT;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null; // static output, served via nginx in prod
    outputDirectory = pkg.homepage?.startsWith('.') ? 'build' : 'build';
  } else if (
    'react' in deps &&
    (files['vite.config.js'] !== null || files['vite.config.ts'] !== null)
  ) {
    runtimeType = RuntimeType.REACT;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if (
    'vue' in deps &&
    (files['vite.config.js'] !== null || files['vite.config.ts'] !== null)
  ) {
    runtimeType = RuntimeType.VUE;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if ('vue' in deps && '@vue/cli-service' in deps) {
    runtimeType = RuntimeType.VUE;
    buildCommand = buildCommand ?? 'npm run build';
    startCommand = null;
    outputDirectory = 'dist';
  } else if ('express' in deps) {
    runtimeType = RuntimeType.EXPRESS;
    applicationPort = findSamplePort(files) ?? 3000;
  } else if (scripts.start) {
    runtimeType = RuntimeType.NODEJS;
    applicationPort = findSamplePort(files) ?? 3000;
  } else {
    runtimeType = RuntimeType.UNKNOWN;
    issues.push({
      level: 'ERROR',
      message:
        'Could not identify a supported runtime. Ensure a "start" script exists in package.json, or that a supported framework (Express, React, Vue, Next.js) is listed as a dependency.',
    });
  }

  // ── Validate start/build requirements ──────────────────────────────────────

  if ([RuntimeType.EXPRESS, RuntimeType.NODEJS].includes(runtimeType)) {
    if (!scripts.start) {
      issues.push({
        level: 'ERROR',
        message:
          'No "start" script found in package.json. Add "start": "node server.js" (or similar).',
      });
    }
    // Warn if start script hardcodes a port number (not using PORT env var)
    if (scripts.start && /\b(?:port|PORT)\s*=?\s*\d{4,5}/i.test(scripts.start)) {
      issues.push({
        level: 'WARNING',
        message:
          'The "start" script appears to hardcode a port. Use the PORT environment variable: process.env.PORT || 3000.',
      });
    }
  }

  if ([RuntimeType.NEXTJS, RuntimeType.REACT, RuntimeType.VUE].includes(runtimeType)) {
    if (!scripts.build) {
      issues.push({
        level: 'ERROR',
        message:
          'No "build" script found in package.json. Add "build": "...' + '" to package.json.',
      });
    }
  }

  // ── Lock file check ─────────────────────────────────────────────────────────
  const hasPackageLock = files['package-lock.json'] !== null;
  const hasUnsupportedLockFile = files['yarn.lock'] !== null || files['pnpm-lock.yaml'] !== null;

  if (!hasPackageLock) {
    issues.push({
      level: 'ERROR',
      message: hasUnsupportedLockFile
        ? 'HelloDeploy currently supports npm projects only. Commit package-lock.json; Yarn and pnpm lockfiles are not yet supported.'
        : 'No package-lock.json found. HelloDeploy uses npm ci and requires an npm lockfile for reproducible builds.',
    });
  }

  // ── Dockerfile ──────────────────────────────────────────────────────────────
  // The build always uses a generated Dockerfile, so a user's one only matters
  // when the app relies on system packages it installs.
  if (files['Dockerfile'] !== null) {
    const systemPackages = findDockerfileSystemPackages(files['Dockerfile']);
    issues.push(
      systemPackages.length > 0
        ? {
            level: 'WARNING',
            message: `Your Dockerfile installs extra packages (${systemPackages.join(', ')}). HelloDeploy builds its own image and ignores your Dockerfile, so these will not be available and the app may fail at runtime.`,
          }
        : {
            level: 'INFO',
            message:
              'A Dockerfile was found. HelloDeploy builds its own container image, so your Dockerfile is ignored. No action is needed.',
          },
    );
  }

  const hasErrors = issues.some((i) => i.level === 'ERROR');
  const nextStrategy = runtimeType === RuntimeType.NEXTJS ? detectNextStrategy(files) : null;
  return {
    runtimeType,
    buildCommand: buildCommand ?? null,
    startCommand: startCommand ?? null,
    outputDirectory,
    applicationPort,
    issues,
    isValid: !hasErrors,
    recommendedBuildStrategy: nextStrategy?.strategy ?? BuildStrategy.LEGACY_GENERATED,
    strategyRationale: nextStrategy?.rationale ?? 'Existing generated-image behavior is preserved.',
  };
}

/**
 * The saved strategy once detection has found a runtime. A versioned strategy
 * bound to another runtime can no longer build, so it falls back to the legacy
 * build until the owner picks a mode for the new runtime.
 */
export function strategyAfterDetection(currentStrategy, runtimeType) {
  const strategyRuntime = getBuildStrategyRuntime(currentStrategy);
  return strategyRuntime && strategyRuntime !== runtimeType
    ? BuildStrategy.LEGACY_GENERATED
    : (currentStrategy ?? null);
}

// ─── GitHub file fetching ─────────────────────────────────────────────────────

const FILES_TO_FETCH = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'index.html',
  'Dockerfile',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.cjs',
  'next.config.mjs',
  'next.config.ts',
  'next.config.mts',
  '.env.example',
  '.env.sample',
  '.env.template',
  'requirements.txt',
  'pyproject.toml',
  '.python-version',
  'composer.json',
  'index.php',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
];
const DETECTION_REQUEST_TIMEOUT_MS = 10_000;
const DETECTION_RESPONSE_MAX_BYTES = 750_000;
// Detection only checks that these exist, so one too large to read still counts.
const PRESENCE_ONLY_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
]);

class DetectionFileTooLargeError extends Error {
  constructor(path) {
    super(`GitHub API response too large for ${path}`);
    this.code = 'DETECTION_FILE_TOO_LARGE';
  }
}

async function readBoundedDetectionResponse(res, path) {
  const declaredLength = Number.parseInt(res.headers.get('content-length') ?? '0', 10);
  if (declaredLength > DETECTION_RESPONSE_MAX_BYTES) {
    throw new DetectionFileTooLargeError(path);
  }
  const chunks = [];
  let receivedBytes = 0;
  const reader = res.body?.getReader();
  if (!reader) {
    return res.text();
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    receivedBytes += value.byteLength;
    if (receivedBytes > DETECTION_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new DetectionFileTooLargeError(path);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchGithubFile(token, owner, repo, path, ref) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(DETECTION_REQUEST_TIMEOUT_MS),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hellodeploy',
    },
  });
  if (res.status === 404) {
    return null; // file does not exist in this repo
  }
  if (!res.ok) {
    throw new Error(`GitHub API error fetching ${path}: ${res.status}`);
  }
  const responseText = await readBoundedDetectionResponse(res, path);
  const data = JSON.parse(responseText);
  // Directories return an array — treat as missing
  if (Array.isArray(data)) {
    return null;
  }
  if (data.encoding === 'base64') {
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  return data.content ?? null;
}

function fileAtApplicationRoot(applicationRoot, path) {
  return applicationRoot === '.' ? path : `${applicationRoot}/${path}`;
}

/**
 * Fetch the detection files for a repository at a ref. A missing file (404) is
 * null and an oversized lockfile is an empty string; any other GitHub error
 * fails the whole fetch, so a rate limit is never mistaken for an absent file
 * and saved as the wrong runtime.
 */
export async function fetchProjectFilesForRepository(repository, ref, applicationRoot = '.') {
  const token =
    repository.sourceType === RepositorySourceType.PUBLIC_GIT
      ? null
      : await getInstallationToken(repository.installationId);
  const [owner, repo] = repository.fullName.split('/');
  const fetchFile = async (path) => {
    try {
      return await fetchGithubFile(
        token,
        owner,
        repo,
        fileAtApplicationRoot(applicationRoot, path),
        ref,
      );
    } catch (error) {
      if (error.code === 'DETECTION_FILE_TOO_LARGE' && PRESENCE_ONLY_FILES.has(path)) {
        return '';
      }
      throw error;
    }
  };
  const contents = await Promise.all(FILES_TO_FETCH.map(fetchFile));
  const files = Object.fromEntries(FILES_TO_FETCH.map((path, index) => [path, contents[index]]));
  // Only Next.js needs it: the default image copies public/ into the runtime stage.
  if (/"next"\s*:/.test(files['package.json'] ?? '')) {
    files['public/'] = await githubPathExists(
      token,
      owner,
      repo,
      fileAtApplicationRoot(applicationRoot, 'public'),
      ref,
    );
  }
  return addBackendEntryFiles(files, fetchFile);
}

/** True when a file or folder exists at the path; GitHub answers 404 otherwise. */
async function githubPathExists(token, owner, repo, path, ref) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(DETECTION_REQUEST_TIMEOUT_MS),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hellodeploy',
    },
  });
  await res.body?.cancel();
  if (res.status === 404) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`GitHub API error checking ${path}: ${res.status}`);
  }
  return true;
}

// Entry-point candidates are fetched only for repositories with backend
// markers, keeping the per-detection GitHub request count down for the rest.
async function addBackendEntryFiles(files, fetchFile) {
  const paths = [
    ...(hasPythonMarkers(files) ? PYTHON_ENTRY_PATHS : []),
    ...(hasPhpMarkers(files) ? PHP_ENTRY_PATHS : []),
    ...(hasJavaMarkers(files) ? JAVA_ENTRY_PATHS : []),
  ];
  const contents = await Promise.all(paths.map(fetchFile));
  paths.forEach((path, index) => {
    files[path] = contents[index];
  });
  return files;
}

const INSTALL_VERBS = Object.freeze({
  'apt-get': 'install',
  apt: 'install',
  apk: 'add',
  yum: 'install',
  dnf: 'install',
  pip: 'install',
  pip3: 'install',
});
const MAX_REPORTED_PACKAGES = 8;

/**
 * Names of the system and pip packages a Dockerfile's RUN steps install.
 * A best-effort read of common install commands, not a shell parser.
 */
export function findDockerfileSystemPackages(content) {
  const lines = String(content ?? '')
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/);
  const packages = new Set();
  for (const line of lines) {
    const run = line.match(/^\s*RUN\s+(.*)$/i);
    if (!run) {
      continue;
    }
    for (const command of run[1].split(/&&|\|\||;|\|/)) {
      for (const name of installedPackages(command.trim().split(/\s+/))) {
        packages.add(name);
      }
    }
  }
  return [...packages].slice(0, MAX_REPORTED_PACKAGES);
}

function installedPackages(tokens) {
  const managerIndex = tokens.findIndex((token) => Object.hasOwn(INSTALL_VERBS, token));
  if (managerIndex === -1) {
    return [];
  }
  const verbIndex = tokens.indexOf(INSTALL_VERBS[tokens[managerIndex]], managerIndex + 1);
  if (verbIndex === -1) {
    return [];
  }
  const names = [];
  for (let index = verbIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-r' || token === '--requirement') {
      const file = tokens[index + 1];
      if (file) {
        names.push(`packages from ${file.slice(0, 60)}`);
      }
      index += 1;
    } else if (token && !token.startsWith('-')) {
      // Drop version pins such as ffmpeg=7.* or flask==3.0.
      names.push(token.replace(/[=<>~!].*$/, '').slice(0, 60));
    }
  }
  return names.filter(Boolean);
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

function safeDetectionIssues(issues) {
  return issues.map(({ level, message }) => ({
    level: ['WARNING', 'INFO'].includes(level) ? level : 'ERROR',
    message: String(message).slice(0, 500),
  }));
}

/** Extract names only from conventional environment sample files. Values are never retained. */
// An app that ignores PORT and listens on its own fixed port usually documents
// that port in its sample env file; starting from it avoids a first deploy
// that health-checks the wrong port.
function findSamplePort(files) {
  for (const path of ['.env.example', '.env.sample', '.env.template']) {
    const match = files[path]?.match?.(
      /^\s*(?:export\s+)?PORT\s*=\s*["']?(\d{2,5})["']?\s*(?:#.*)?$/m,
    );
    const port = match ? Number(match[1]) : null;
    if (port >= 1 && port <= 65535) {
      return port;
    }
  }
  return null;
}

export function detectRequiredEnvironmentVariables(files) {
  const names = new Set();
  for (const path of ['.env.example', '.env.sample', '.env.template']) {
    const content = files[path];
    if (typeof content !== 'string') {
      continue;
    }
    for (const line of content.split(/\r?\n/).slice(0, 500)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/i);
      const name = match?.[1].toUpperCase();
      if (name && !PLATFORM_MANAGED_ENV_NAMES.includes(name)) {
        names.add(name);
      }
      if (names.size >= 100) {
        break;
      }
    }
  }
  return [...names].sort();
}

function detectedConfiguration(result) {
  return {
    buildCommand: result.buildCommand ?? null,
    startCommand: result.startCommand ?? null,
    outputDirectory: result.outputDirectory ?? null,
    applicationPort: result.applicationPort ?? null,
    healthCheckPath: result.healthCheckPath ?? '/',
    applicationRoot: result.applicationRoot ?? '.',
    applicationModule: result.applicationModule ?? null,
  };
}

async function persistDetectionResult(projectId, result, checkedCommitSha = null) {
  await Project.updateOne(
    { _id: projectId },
    {
      // Field by field, so what an earlier successful run found survives a
      // run that could not reach the repository.
      $set: {
        'detection.status': result.isValid
          ? DetectionStatus.READY
          : DetectionStatus.NEEDS_ATTENTION,
        'detection.issues': safeDetectionIssues(result.issues),
        'detection.checkedCommitSha': checkedCommitSha,
        'detection.checkedAt': new Date(),
        'detection.detectedConfiguration': null,
        'detection.requiredEnvironmentVariables': [],
      },
    },
  );
}

/**
 * Run full project detection against the connected repository.
 * Fetches files from GitHub, runs the analyzer, and persists results to the project.
 *
 * @param {string} projectId
 * @param {string} actorId
 * @param {{ sourceIp?: string, correlationId?: string }} opts
 * @returns {Promise<{ isValid: boolean, runtimeType: string, issues: Array }>}
 */
export async function runProjectDetection(projectId, actorId, opts = {}) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.repositoryId) {
    const result = {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [{ level: 'ERROR', message: 'No repository connected. Connect a repository first.' }],
    };
    await persistDetectionResult(project._id, result);
    return result;
  }

  const repo = await Repository.findById(project.repositoryId);
  if (!repo || repo.accessStatus !== 'ACTIVE') {
    const result = {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [{ level: 'ERROR', message: 'Repository access is no longer active.' }],
    };
    await persistDetectionResult(project._id, result);
    return result;
  }

  const ref = repo.lastCommitSha ?? project.productionBranch ?? repo.defaultBranch;

  let files;
  try {
    const applicationRoot = normalizeApplicationRoot(
      project.buildConfiguration?.applicationRoot ?? '.',
    );
    files = await fetchProjectFilesForRepository(repo, ref, applicationRoot);
  } catch (err) {
    logger.warn('Detection: GitHub fetch failed', { projectId, error: err.message });
    const result = {
      isValid: false,
      runtimeType: RuntimeType.UNKNOWN,
      issues: [
        {
          level: 'ERROR',
          message: 'Could not retrieve repository files from GitHub. Check access and try again.',
        },
      ],
    };
    await persistDetectionResult(project._id, result, repo.lastCommitSha);
    return result;
  }

  const result = detectRuntime(files, { currentStrategy: project.buildStrategy });
  result.recommendedBuildStrategy ??= BuildStrategy.LEGACY_GENERATED;
  result.strategyRationale ??= 'Existing generated-image behavior is preserved.';
  result.applicationRoot = normalizeApplicationRoot(
    project.buildConfiguration?.applicationRoot ?? '.',
  );
  result.requiredEnvironmentVariables = detectRequiredEnvironmentVariables(files);
  const detected = detectedConfiguration(result);

  // A project deployed from its own image keeps its runtime and settings;
  // detection still records what the repository looks like.
  const isOwnerImageProject = isContainerBuildStrategy(project.buildStrategy);
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        ...(isOwnerImageProject
          ? {}
          : {
              runtimeType: result.runtimeType,
              buildConfiguration: detected,
              buildStrategy: strategyAfterDetection(project.buildStrategy, result.runtimeType),
            }),
        detection: {
          status: result.isValid ? DetectionStatus.READY : DetectionStatus.NEEDS_ATTENTION,
          issues: safeDetectionIssues(result.issues),
          checkedCommitSha: repo.lastCommitSha,
          checkedAt: new Date(),
          detectedConfiguration: detected,
          detectedRuntimeType: result.runtimeType,
          recommendedBuildStrategy: result.recommendedBuildStrategy,
          strategyRationale: result.strategyRationale,
          requiredEnvironmentVariables: result.requiredEnvironmentVariables,
        },
        configurationVersion: project.configurationVersion + 1,
      },
    },
  );

  await writeAuditEvent({
    action: 'project.detection_run',
    outcome: result.isValid ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
    actorId,
    targetType: 'project',
    targetId: projectId,
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: {
      runtimeType: result.runtimeType,
      issueCount: result.issues.length,
      errorCount: result.issues.filter((i) => i.level === 'ERROR').length,
    },
  });
  await recordProductEvent({
    name: 'detection_completed',
    userId: actorId,
    projectId,
    properties: result.isValid ? null : { reason: 'fix_required' },
  });

  return result;
}
