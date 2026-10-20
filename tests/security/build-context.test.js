import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chmod,
  mkdtemp,
  writeFile,
  symlink,
  readdir,
  rm,
  mkdir,
  readFile,
  open,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { prepareBuildContext, writePlatformDockerignore, listRootEnvFiles } =
  await import('../../apps/worker/src/deployment/build-context.js');

async function makeContext() {
  return mkdtemp(join(tmpdir(), 'hellodeploy-bc-'));
}

async function makeDeepDirectory(root, depth) {
  let directory = root;
  for (let index = 0; index < depth; index += 1) {
    directory = join(directory, `d${index}`);
  }
  await mkdir(directory, { recursive: true });
  return directory;
}

// ─── Forbidden file removal ───────────────────────────────────────────────────

describe('prepareBuildContext — forbidden file removal', () => {
  it('removes a user-provided Dockerfile (we generate our own)', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'Dockerfile'), 'FROM ubuntu\nRUN rm -rf /');
    await writeFile(join(dir, 'index.html'), '<html></html>');
    await prepareBuildContext(dir);
    const entries = await readdir(dir);
    assert.ok(!entries.includes('Dockerfile'), 'Dockerfile must be removed');
    assert.ok(entries.includes('index.html'), 'legitimate files must remain');
    await rm(dir, { recursive: true, force: true });
  });

  it('removes lowercase dockerfile', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'dockerfile'), 'FROM alpine');
    await writeFile(join(dir, 'app.js'), '');
    await prepareBuildContext(dir);
    assert.ok(!(await readdir(dir)).includes('dockerfile'));
    await rm(dir, { recursive: true, force: true });
  });

  it('removes docker-compose.yml', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'docker-compose.yml'), 'version: "3"');
    await writeFile(join(dir, 'app.js'), '');
    await prepareBuildContext(dir);
    assert.ok(!(await readdir(dir)).includes('docker-compose.yml'));
    await rm(dir, { recursive: true, force: true });
  });

  it('removes docker-compose.yaml', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'docker-compose.yaml'), 'version: "3"');
    await writeFile(join(dir, 'app.js'), '');
    await prepareBuildContext(dir);
    assert.ok(!(await readdir(dir)).includes('docker-compose.yaml'));
    await rm(dir, { recursive: true, force: true });
  });

  it('removes docker-compose.override.yml', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'docker-compose.override.yml'), '');
    await writeFile(join(dir, 'app.js'), '');
    await prepareBuildContext(dir);
    assert.ok(!(await readdir(dir)).includes('docker-compose.override.yml'));
    await rm(dir, { recursive: true, force: true });
  });

  it('removes .dockerignore', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, '.dockerignore'), 'node_modules');
    await writeFile(join(dir, 'package.json'), '{}');
    await prepareBuildContext(dir);
    assert.ok(!(await readdir(dir)).includes('.dockerignore'));
    await rm(dir, { recursive: true, force: true });
  });

  it('succeeds without error when none of the forbidden files are present', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'index.js'), 'console.log("hello")');
    await writeFile(join(dir, 'package.json'), '{ "name": "app" }');
    await assert.doesNotReject(() => prepareBuildContext(dir));
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── Symlink containment (path traversal via symlink) ────────────────────────

describe('prepareBuildContext — Dockerfile-specific ignore file', () => {
  it('removes a committed Dockerfile.dockerignore that would replace the platform rules', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'Dockerfile.dockerignore'), '');
    await prepareBuildContext(dir);
    assert.deepEqual(await readdir(dir), []);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('prepareBuildContext — symlink containment', () => {
  it('removes a top-level symlink whose real target is outside the build context', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'app.js'), '');
    // A malicious repo could contain a symlink pointing to /etc (host OS files)
    await symlink('/etc', join(dir, 'escape'));
    await prepareBuildContext(dir);
    const entries = await readdir(dir);
    assert.ok(!entries.includes('escape'), 'symlink pointing outside context root must be removed');
    assert.ok(entries.includes('app.js'), 'legitimate files must survive');
    await rm(dir, { recursive: true, force: true });
  });

  it('removes a broken (dangling) symlink', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'app.js'), '');
    await symlink('/nonexistent/path/that/cannot/exist', join(dir, 'broken'));
    await prepareBuildContext(dir);
    const entries = await readdir(dir);
    assert.ok(!entries.includes('broken'), 'broken symlink must be removed');
    await rm(dir, { recursive: true, force: true });
  });

  it('removes a symlink escaping the context root from a nested subdirectory', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'app.js'), '');
    await mkdir(join(dir, 'src', 'lib'), { recursive: true });
    // A malicious repo could bury the escape several directories deep instead
    // of at the top level.
    await symlink('/etc', join(dir, 'src', 'lib', 'escape'));
    await prepareBuildContext(dir);
    const entries = await readdir(join(dir, 'src', 'lib'));
    assert.ok(
      !entries.includes('escape'),
      'nested symlink pointing outside context root must be removed',
    );
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps a symlink whose real target is inside the build context', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'app.js'), '');
    // Internal symlink (valid use case — e.g. node_modules/.bin links at top level)
    await symlink(join(dir, 'app.js'), join(dir, 'internal-link'));
    await prepareBuildContext(dir);
    const entries = await readdir(dir);
    assert.ok(
      entries.includes('internal-link'),
      'symlink whose target is inside the context must be kept',
    );
    await rm(dir, { recursive: true, force: true });
  });

  it('removes an escaping symlink nested beyond the former depth limit', async () => {
    const dir = await makeContext();
    const deep = await makeDeepDirectory(dir, 45);
    await symlink('/etc', join(deep, 'escape'));
    await prepareBuildContext(dir);
    assert.ok(!(await readdir(deep)).includes('escape'));
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── Return value ─────────────────────────────────────────────────────────────

describe('prepareBuildContext — return value', () => {
  it('returns sizeBytes for the prepared context', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'app.js'), 'x'.repeat(1024));
    const result = await prepareBuildContext(dir);
    assert.ok(typeof result.sizeBytes === 'number', 'sizeBytes must be a number');
    assert.ok(result.sizeBytes >= 1024, 'sizeBytes must reflect written content');
    await rm(dir, { recursive: true, force: true });
  });

  it('counts a valid file nested beyond the former size depth limit', async () => {
    const dir = await makeContext();
    const deep = await makeDeepDirectory(dir, 25);
    await writeFile(join(deep, 'payload.bin'), 'deep-content');
    const result = await prepareBuildContext(dir);
    assert.equal(result.sizeBytes, Buffer.byteLength('deep-content'));
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects an oversized sparse file nested beyond the former size depth limit', async () => {
    const dir = await makeContext();
    const deep = await makeDeepDirectory(dir, 25);
    const handle = await open(join(deep, 'oversized.bin'), 'w');
    await handle.truncate(501 * 1024 * 1024);
    await handle.close();
    await assert.rejects(() => prepareBuildContext(dir), /Build context is too large/);
    await rm(dir, { recursive: true, force: true });
  });

  it('handles a valid context nested beyond the former symlink depth limit', async () => {
    const dir = await makeContext();
    const deep = await makeDeepDirectory(dir, 60);
    await writeFile(join(deep, 'app.js'), 'export default true;');
    await assert.doesNotReject(() => prepareBuildContext(dir));
    await rm(dir, { recursive: true, force: true });
  });
});

describe('prepareBuildContext — size of skipped folders', () => {
  // Legacy builds send node_modules and .git to the daemon, so they count.
  it('counts node_modules toward the context size limit', async () => {
    const dir = await makeContext();
    await mkdir(join(dir, 'node_modules'));
    const handle = await open(join(dir, 'node_modules', 'big.bin'), 'w');
    await handle.truncate(501 * 1024 * 1024);
    await handle.close();
    await assert.rejects(() => prepareBuildContext(dir), /Build context is too large/);
    await rm(dir, { recursive: true, force: true });
  });

  it('leaves symlinks inside node_modules alone', async () => {
    const dir = await makeContext();
    await mkdir(join(dir, 'node_modules', '.bin'), { recursive: true });
    await symlink('/etc/hostname', join(dir, 'node_modules', '.bin', 'tool'));
    await prepareBuildContext(dir);
    assert.deepEqual(await readdir(join(dir, 'node_modules', '.bin')), ['tool']);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('prepareBuildContext — application-root pass', () => {
  // The repository pass already counted every file; the application-root pass
  // only tightens symlink containment and removes forbidden files.
  it('scrubs links leaving the root without recounting file sizes', async () => {
    const dir = await makeContext();
    const handle = await open(join(dir, 'big.bin'), 'w');
    await handle.truncate(501 * 1024 * 1024);
    await handle.close();
    await symlink('/etc/hostname', join(dir, 'escape'));
    await prepareBuildContext(dir, { countSize: false });
    assert.deepEqual((await readdir(dir)).sort(), ['big.bin']);
    await rm(dir, { recursive: true, force: true });
  });

  // An unreadable folder fails the pass only if the pass walks into it.
  it('does not walk dependency folders it neither scrubs nor counts', async () => {
    const dir = await makeContext();
    const sealed = join(dir, 'node_modules', 'sealed');
    await mkdir(sealed, { recursive: true });
    await chmod(sealed, 0o000);
    await assert.doesNotReject(prepareBuildContext(dir, { countSize: false }));
    await chmod(sealed, 0o700);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('platform Docker context exclusions', () => {
  it('writes fixed secret, dependency, log, cache, and coverage exclusions', async () => {
    const dir = await makeContext();
    await writePlatformDockerignore(dir);
    const content = await readFile(join(dir, '.dockerignore'), 'utf8');
    for (const pattern of ['.env*', '**/.env*', 'node_modules', '**/node_modules', 'coverage']) {
      assert.ok(content.includes(pattern), pattern);
    }
    assert.ok(!content.split('\n').some((line) => line.startsWith('!')));
    await rm(dir, { recursive: true, force: true });
  });

  it('replaces rather than reuses a removed user-controlled ignore file', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, '.dockerignore'), '!**/.env\n');
    await prepareBuildContext(dir);
    await writePlatformDockerignore(dir);
    const content = await readFile(join(dir, '.dockerignore'), 'utf8');
    assert.ok(!content.includes('!**/.env'));
    assert.ok(content.includes('**/.env*'));
    await rm(dir, { recursive: true, force: true });
  });
});

describe('platform Docker context exclusions — generated files', () => {
  it('keeps the generated Dockerfile out of copied image content', async () => {
    const dir = await makeContext();
    await writePlatformDockerignore(dir);
    const lines = (await readFile(join(dir, '.dockerignore'), 'utf8')).split('\n');
    assert.ok(lines.includes('Dockerfile'));
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps the ignore file itself out of copied image content', async () => {
    const dir = await makeContext();
    await writePlatformDockerignore(dir);
    const lines = (await readFile(join(dir, '.dockerignore'), 'utf8')).split('\n');
    assert.ok(lines.includes('.dockerignore'));
    await rm(dir, { recursive: true, force: true });
  });
});

describe('listRootEnvFiles', () => {
  it('names root-level env files that the platform exclusions drop', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, '.env.production'), 'VITE_API_URL=https://api.example.test\n');
    await writeFile(join(dir, '.env'), 'SECRET=value\n');
    await writeFile(join(dir, 'index.js'), '');
    await mkdir(join(dir, '.envs'));
    await mkdir(join(dir, 'app'));
    await writeFile(join(dir, 'app', '.env'), 'NESTED=1\n');
    assert.deepEqual(await listRootEnvFiles(dir), ['.env', '.env.production']);
    await rm(dir, { recursive: true, force: true });
  });
});
