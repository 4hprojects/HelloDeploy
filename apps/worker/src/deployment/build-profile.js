import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeType } from '@hellodeploy/contracts';
import { ImageTemplateVersion } from './template-policy.js';

const ROOT_INSTALL_LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'prepack',
];
const NEXT_CONFIG_FILES = [
  'next.config.js',
  'next.config.cjs',
  'next.config.mjs',
  'next.config.ts',
  'next.config.mts',
];
const NEXT_STANDALONE_PATTERN = /\boutput\s*:\s*['"]standalone['"]/;
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'devDependencies'];
const LOCAL_DEPENDENCY_PREFIXES = ['file:', 'link:'];

/** Raised when a requested optimized profile cannot be built safely or truthfully. */
export class BuildProfileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildProfileError';
    this.code = 'BUILD_CONTEXT_INVALID';
  }
}

async function readOptionalFile(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function legacyFallback(reason) {
  return { templateVersion: ImageTemplateVersion.LEGACY, fallbackReason: reason };
}

export async function resolveBuildProfile({ contextDir, runtimeType, requestedTemplateVersion }) {
  if (requestedTemplateVersion === ImageTemplateVersion.LEGACY) {
    return { templateVersion: ImageTemplateVersion.LEGACY, fallbackReason: null };
  }

  if (runtimeType === RuntimeType.STATIC) {
    return { templateVersion: ImageTemplateVersion.OPTIMIZED_V1, fallbackReason: null };
  }

  const [packageJsonContent, packageLockContent, npmrcContent] = await Promise.all([
    readOptionalFile(join(contextDir, 'package.json')),
    readOptionalFile(join(contextDir, 'package-lock.json')),
    readOptionalFile(join(contextDir, '.npmrc')),
  ]);
  if (!packageJsonContent || !packageLockContent) {
    return legacyFallback('optimized-v1 requires package.json and package-lock.json');
  }

  let packageJson;
  try {
    packageJson = JSON.parse(packageJsonContent);
  } catch {
    return legacyFallback('optimized-v1 requires valid package.json JSON');
  }

  if ([RuntimeType.EXPRESS, RuntimeType.NODEJS].includes(runtimeType)) {
    const scripts = packageJson.scripts ?? {};
    const lifecycleScript = ROOT_INSTALL_LIFECYCLE_SCRIPTS.find((name) => scripts[name]);
    if (lifecycleScript) {
      return legacyFallback(`root ${lifecycleScript} lifecycle requires legacy ordering`);
    }
    if (scripts.build) {
      return legacyFallback('Node.js build script requires the future build/prune profile');
    }
    // The dependency stage sees only package*.json, so anything npm ci resolves
    // from elsewhere in the repository has to keep the source-first ordering.
    if (packageJson.workspaces) {
      return legacyFallback('npm workspaces require legacy ordering');
    }
    if (hasLocalDependency(packageJson)) {
      return legacyFallback('file: or link: dependencies require legacy ordering');
    }
    if (npmrcContent !== null) {
      return legacyFallback('a committed .npmrc requires legacy ordering');
    }
  }

  if (runtimeType === RuntimeType.NEXTJS) {
    const nextConfigs = await Promise.all(
      NEXT_CONFIG_FILES.map((name) => readOptionalFile(join(contextDir, name))),
    );
    if (!nextConfigs.some((content) => content && NEXT_STANDALONE_PATTERN.test(content))) {
      throw new BuildProfileError(
        'optimized-v1 requires Next.js standalone output to be statically confirmed',
      );
    }
  }

  return { templateVersion: ImageTemplateVersion.OPTIMIZED_V1, fallbackReason: null };
}

function hasLocalDependency(packageJson) {
  return DEPENDENCY_FIELDS.some((field) =>
    Object.values(packageJson[field] ?? {}).some(
      (spec) =>
        typeof spec === 'string' &&
        LOCAL_DEPENDENCY_PREFIXES.some((prefix) => spec.startsWith(prefix)),
    ),
  );
}
