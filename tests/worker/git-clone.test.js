import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
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

  it('aborts a download that stops sending data', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.write(fixtureTarball.subarray(0, 10));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const localUrl = `http://127.0.0.1:${server.address().port}/`;
    global.fetch = (_url, options) => originalFetch(localUrl, options);

    try {
      await assert.rejects(
        clonePublicExactCommit({
          ownerLogin: OWNER,
          repoName: REPO,
          commitSha: SHA,
          workDir: await makeWorkDir(),
          downloadIdleTimeoutMs: 100,
        }),
        { name: 'TimeoutError', message: 'Archive download stalled for 0.1 s.' },
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
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

describe('clonePublicExactCommit source cache', () => {
  const cachedPath = (cacheDir, sha = SHA) => join(cacheDir, OWNER, REPO, `${sha}.tar.gz`);
  const serveFixture = () => {
    global.fetch = async () => new Response(fixtureTarball, { status: 200 });
  };
  const clone = async (cacheDir, extra = {}) =>
    clonePublicExactCommit({
      ownerLogin: OWNER,
      repoName: REPO,
      commitSha: SHA,
      workDir: await makeWorkDir(),
      cacheDir,
      ...extra,
    });

  it('stores the downloaded archive under the commit SHA', async () => {
    const cacheDir = await makeWorkDir();
    serveFixture();

    await clone(cacheDir);

    assert.equal((await stat(cachedPath(cacheDir))).size, fixtureTarball.length);
  });

  it('reports the downloaded byte count on a cache miss', async () => {
    const cacheDir = await makeWorkDir();
    serveFixture();

    assert.deepEqual(await clone(cacheDir), { cached: false, bytes: fixtureTarball.length });
  });

  it('extracts a cached commit without touching the network', async () => {
    const cacheDir = await makeWorkDir();
    serveFixture();
    await clone(cacheDir);
    global.fetch = async () => {
      throw new Error('network must not be used');
    };
    const workDir = await makeWorkDir();

    await clonePublicExactCommit({
      ownerLogin: OWNER,
      repoName: REPO,
      commitSha: SHA,
      workDir,
      cacheDir,
    });

    const pkg = JSON.parse(await readFile(join(workDir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'example-app');
  });

  it('leaves nothing in the cache when the download is rejected', async () => {
    const cacheDir = await makeWorkDir();
    serveFixture();

    await assert.rejects(clone(cacheDir, { maxBytes: 10 }));

    assert.deepEqual(await readdir(join(cacheDir, OWNER, REPO)), []);
  });

  it('discards a corrupt cached archive so the next attempt downloads again', async () => {
    const cacheDir = await makeWorkDir();
    await mkdir(join(cacheDir, OWNER, REPO), { recursive: true });
    await writeFile(cachedPath(cacheDir), 'not a tarball');

    await assert.rejects(clone(cacheDir));

    await assert.rejects(stat(cachedPath(cacheDir)));
  });

  it('keeps only the newest archives for a repository', async () => {
    const cacheDir = await makeWorkDir();
    await mkdir(join(cacheDir, OWNER, REPO), { recursive: true });
    const old = new Date('2026-01-01T00:00:00Z');
    for (const sha of ['b', 'c', 'd'].map((c) => c.repeat(40))) {
      await writeFile(cachedPath(cacheDir, sha), 'old');
      await utimes(cachedPath(cacheDir, sha), old, old);
    }
    serveFixture();

    await clone(cacheDir, { keepArchives: 2 });

    assert.equal((await readdir(join(cacheDir, OWNER, REPO))).length, 2);
  });
});
