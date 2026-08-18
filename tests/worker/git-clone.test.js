import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, afterEach, before, describe, it } from 'node:test';

const execFileAsync = promisify(execFile);

const originalFetch = global.fetch;
const { clonePublicExactCommit } = await import('../../apps/worker/src/git/clone.js');

const OWNER = 'example';
const REPO = 'app';
const SHA = 'a'.repeat(40);

let fixtureTarball;
const tempDirs = [];

before(async () => {
  // Build a real gzipped tarball mimicking GitHub's archive format: a single
  // top-level wrapper directory containing the repo's files.
  const buildDir = await mkdtemp(join(tmpdir(), 'clone-fixture-'));
  const wrapperName = `${REPO}-${SHA}`;
  const wrapperDir = join(buildDir, wrapperName);
  await mkdir(join(wrapperDir, 'src'), { recursive: true });
  await writeFile(join(wrapperDir, 'package.json'), '{"name":"example-app"}\n');
  await writeFile(join(wrapperDir, 'src', 'index.js'), 'console.log("hi");\n');

  const tarballPath = join(buildDir, 'archive.tar.gz');
  await execFileAsync('tar', ['-czf', tarballPath, '-C', buildDir, wrapperName]);
  fixtureTarball = await readFile(tarballPath);
  await rm(buildDir, { recursive: true, force: true });
});

afterEach(() => {
  global.fetch = originalFetch;
});

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeWorkDir() {
  const dir = await mkdtemp(join(tmpdir(), 'clone-workdir-'));
  tempDirs.push(dir);
  return dir;
}

describe('clonePublicExactCommit', () => {
  it('downloads and extracts the archive, stripping the wrapper directory', async () => {
    const workDir = await makeWorkDir();
    global.fetch = async (url) => {
      assert.equal(String(url), `https://codeload.github.com/${OWNER}/${REPO}/tar.gz/${SHA}`);
      return new Response(fixtureTarball, { status: 200 });
    };

    await clonePublicExactCommit({ ownerLogin: OWNER, repoName: REPO, commitSha: SHA, workDir });

    const pkg = JSON.parse(await readFile(join(workDir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'example-app');
    const indexJs = await readFile(join(workDir, 'src', 'index.js'), 'utf8');
    assert.match(indexJs, /console\.log\("hi"\)/);
  });

  it('rejects when the archive download returns a non-200 response', async () => {
    const workDir = await makeWorkDir();
    global.fetch = async () => new Response(null, { status: 404 });

    await assert.rejects(
      clonePublicExactCommit({ ownerLogin: OWNER, repoName: REPO, commitSha: SHA, workDir }),
      /Archive download failed: HTTP 404/,
    );
  });

  it('rejects an archive exceeding the configured size limit without extracting it', async () => {
    const workDir = await makeWorkDir();
    global.fetch = async () => new Response(fixtureTarball, { status: 200 });

    await assert.rejects(
      clonePublicExactCommit({
        ownerLogin: OWNER,
        repoName: REPO,
        commitSha: SHA,
        workDir,
        maxBytes: 10,
      }),
      /Repository archive exceeds the size limit/,
    );
    await assert.rejects(readFile(join(workDir, 'package.json'), 'utf8'));
  });

  it('rejects an invalid commit SHA before making any network call', async () => {
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return new Response(fixtureTarball, { status: 200 });
    };

    await assert.rejects(
      clonePublicExactCommit({
        ownerLogin: OWNER,
        repoName: REPO,
        commitSha: 'not-a-valid-sha',
        workDir: await makeWorkDir(),
      }),
      /Invalid public repository clone parameters/,
    );
    assert.equal(fetchCalled, false);
  });
});
