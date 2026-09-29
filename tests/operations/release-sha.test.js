import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { readReleaseSha } = await import('../../apps/web/src/utils/release-sha.js');

const SHA = 'a'.repeat(40);

/**
 * Nothing could previously say which commit production was running without
 * filesystem access to the host, so every release was taken on trust. This reads
 * `.git/HEAD` directly rather than invoking git, because the production checkout
 * is permission-walled in a way that makes git refuse to run there.
 */
describe('reading the running commit from a checkout', () => {
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'release-sha-'));
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeHead(dir, contents) {
    const gitDir = join(root, dir, '.git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), contents);
    return join(root, dir);
  }

  it('reads a detached HEAD, which is how a release is installed', () => {
    const checkout = writeHead('detached', `${SHA}\n`);

    assert.equal(readReleaseSha(checkout), SHA);
  });

  it('follows HEAD to a branch ref, which is how development checkouts sit', () => {
    const checkout = writeHead('branch', 'ref: refs/heads/main\n');
    mkdirSync(join(checkout, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(checkout, '.git', 'refs', 'heads', 'main'), `${SHA}\n`);

    assert.equal(readReleaseSha(checkout), SHA);
  });

  it('returns null when the branch ref is packed rather than loose', () => {
    const checkout = writeHead('packed', 'ref: refs/heads/main\n');

    assert.equal(readReleaseSha(checkout), null);
  });

  it('returns null when there is no .git at all', () => {
    assert.equal(readReleaseSha(join(root, 'nothing-here')), null);
  });

  it('returns null rather than passing through a malformed HEAD', () => {
    const checkout = writeHead('garbage', 'not-a-sha\n');

    assert.equal(readReleaseSha(checkout), null);
  });

  it('rejects a HEAD of the right length that is not hex', () => {
    const checkout = writeHead('not-hex', `${'z'.repeat(40)}\n`);

    assert.equal(readReleaseSha(checkout), null);
  });

  it('rejects a branch ref that does not contain a commit SHA', () => {
    const checkout = writeHead('bad-ref', 'ref: refs/heads/main\n');
    mkdirSync(join(checkout, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(checkout, '.git', 'refs', 'heads', 'main'), 'still-not-a-sha\n');

    assert.equal(readReleaseSha(checkout), null);
  });
});
