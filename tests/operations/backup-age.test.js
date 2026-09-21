import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { mkdtemp, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { findNewestBackupAgeHours, formatBackupAgeLine } =
  await import('../../scripts/check-backup-age.js');

let dir;

async function writeArchive(name, ageHours) {
  const path = join(dir, name);
  await writeFile(path, 'x');
  const when = new Date(Date.now() - ageHours * 3_600_000);
  await utimes(path, when, when);
}

describe('backup age check', () => {
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hd-backup-'));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports no backup when the directory does not exist', async () => {
    assert.equal(await findNewestBackupAgeHours(join(dir, 'missing')), null);
  });

  it('reports the age of the newest archive', async () => {
    await writeArchive('old.tar.gz', 50);
    await writeArchive('recent.tar.gz', 2);
    const age = await findNewestBackupAgeHours(dir);
    assert.ok(age < 3);
  });

  it('counts an encrypted archive too', async () => {
    const encryptedDir = await mkdtemp(join(tmpdir(), 'hd-backup-gpg-'));
    const path = join(encryptedDir, 'backup.tar.gz.gpg');
    await writeFile(path, 'x');
    const age = await findNewestBackupAgeHours(encryptedDir);
    await rm(encryptedDir, { recursive: true, force: true });
    assert.ok(age !== null);
  });

  it('fails when no backup exists at all', () => {
    assert.match(formatBackupAgeLine(null, 48), /status=failed/);
  });

  it('fails when the newest backup is older than the threshold', () => {
    assert.match(formatBackupAgeLine(72, 48), /status=failed/);
  });

  it('passes when the newest backup is recent enough', () => {
    assert.match(formatBackupAgeLine(12, 48), /status=passed/);
  });
});
