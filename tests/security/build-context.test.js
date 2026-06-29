import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, writeFile, symlink, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { prepareBuildContext } = await import(
  '../../apps/worker/src/deployment/build-context.js'
);

async function makeContext() {
  return mkdtemp(join(tmpdir(), 'hellodeploy-bc-'));
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

describe('prepareBuildContext — symlink containment', () => {
  it('removes a top-level symlink whose real target is outside the build context', async () => {
    const dir = await makeContext();
    await writeFile(join(dir, 'app.js'), '');
    // A malicious repo could contain a symlink pointing to /etc (host OS files)
    await symlink('/etc', join(dir, 'escape'));
    await prepareBuildContext(dir);
    const entries = await readdir(dir);
    assert.ok(
      !entries.includes('escape'),
      'symlink pointing outside context root must be removed',
    );
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
});
