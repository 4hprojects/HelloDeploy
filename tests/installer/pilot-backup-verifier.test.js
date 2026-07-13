import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, it } from 'node:test';

const verifier = new URL('../../infrastructure/verify-pilot-backup.sh', import.meta.url).pathname;
const requiredFiles = {
  environment: 'environment-placeholder\n',
  'dashboard-nginx.conf': 'dashboard-config-placeholder\n',
  'tunnel.yml': 'tunnel-config-placeholder\n',
  'tunnel-credentials': 'credential-placeholder\n',
  'release-commit.txt': `${'a'.repeat(40)}\n`,
  'rollback-instructions': 'private rollback procedure placeholder\n',
  'manifest.json': `${JSON.stringify(
    {
      formatVersion: 1,
      kind: 'hellodeploy-pilot-pre-cutover',
      createdAt: '2026-07-13T00:00:00Z',
      commitSha: 'a'.repeat(40),
      databaseMode: 'verified-external-snapshot',
      dataIncluded: false,
    },
    null,
    2,
  )}\n`,
};

let root;
let payload;
let fakeBin;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function writeChecksumInventory(lines) {
  await writeFile(join(payload, 'CHECKSUMS.sha256'), `${lines.join('\n')}\n`, { mode: 0o600 });
}

async function createArchive(name = 'backup.tar.gz.gpg') {
  const archive = join(root, name);
  const result = spawnSync('tar', ['-czf', archive, '-C', root, 'payload'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return archive;
}

async function setDatabaseExportMode({ includeExport = true } = {}) {
  const manifest = {
    formatVersion: 1,
    kind: 'hellodeploy-pilot-pre-cutover',
    createdAt: '2026-07-13T00:00:00Z',
    commitSha: 'a'.repeat(40),
    databaseMode: 'verified-mongodump-export',
    dataIncluded: false,
  };
  requiredFiles['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(payload, 'manifest.json'), requiredFiles['manifest.json'], { mode: 0o600 });
  if (includeExport) {
    requiredFiles['database-export.archive.gz'] = 'compressed-database-placeholder\n';
    await writeFile(
      join(payload, 'database-export.archive.gz'),
      requiredFiles['database-export.archive.gz'],
      { mode: 0o600 },
    );
  }
  await writeChecksumInventory(
    Object.entries(requiredFiles).map(([name, value]) => `${digest(value)}  ${name}`),
  );
}

function verify(archive) {
  return spawnSync('bash', [verifier, archive], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hellodeploy-pilot-verifier-'));
  payload = join(root, 'payload');
  fakeBin = join(root, 'bin');
  await mkdir(payload, { mode: 0o700 });
  await mkdir(fakeBin, { mode: 0o700 });

  const fakeGpg = join(fakeBin, 'gpg');
  await writeFile(
    fakeGpg,
    `#!/bin/sh
set -eu
output=''
input=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --decrypt) input="$2"; shift 2 ;;
    *) shift ;;
  esac
done
cp "$input" "$output"
`,
  );
  await chmod(fakeGpg, 0o755);

  for (const [name, value] of Object.entries(requiredFiles)) {
    await writeFile(join(payload, name), value, { mode: 0o600 });
  }
  await writeChecksumInventory(
    Object.entries(requiredFiles).map(([name, value]) => `${digest(value)}  ${name}`),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  delete requiredFiles['database-export.archive.gz'];
  requiredFiles['manifest.json'] = `${JSON.stringify(
    {
      formatVersion: 1,
      kind: 'hellodeploy-pilot-pre-cutover',
      createdAt: '2026-07-13T00:00:00Z',
      commitSha: 'a'.repeat(40),
      databaseMode: 'verified-external-snapshot',
      dataIncluded: false,
    },
    null,
    2,
  )}\n`;
});

describe('encrypted pilot backup verifier behavior', () => {
  it('accepts the exact generated payload and verifies every checksum', async () => {
    const result = verify(await createArchive());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /integrity verified/);
  });

  it('accepts a checksummed export when the manifest selects export mode', async () => {
    await setDatabaseExportMode();
    const result = verify(await createArchive());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /integrity verified/);
  });

  it('rejects export mode when the database export is missing', async () => {
    await setDatabaseExportMode({ includeExport: false });
    const result = verify(await createArchive());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /database inventory is inconsistent/);
  });

  it('rejects an export member when the manifest selects snapshot mode', async () => {
    const value = 'unexpected-database-export\n';
    await writeFile(join(payload, 'database-export.archive.gz'), value, { mode: 0o600 });
    await writeChecksumInventory([
      ...Object.entries(requiredFiles).map(([name, content]) => `${digest(content)}  ${name}`),
      `${digest(value)}  database-export.archive.gz`,
    ]);
    const result = verify(await createArchive());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /database inventory is inconsistent/);
  });

  it('rejects an unexpected archive member before extraction', async () => {
    await writeFile(join(payload, 'unexpected'), 'unexpected\n');
    const result = verify(await createArchive());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected, duplicate, or unsafe member/);
  });

  it('rejects a symlink even when its archive name is allowed', async () => {
    await rm(join(payload, 'environment'));
    await symlink('/etc/passwd', join(payload, 'environment'));
    const result = verify(await createArchive());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected, duplicate, or unsafe member/);
  });

  it('rejects checksum paths outside the fixed payload inventory', async () => {
    await writeChecksumInventory([`${'0'.repeat(64)}  ../outside`]);
    const result = verify(await createArchive());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /checksum inventory is unsafe/);
  });

  it('rejects a checksum inventory that omits required payload files', async () => {
    await writeChecksumInventory([`${digest(requiredFiles['manifest.json'])}  manifest.json`]);
    const result = verify(await createArchive());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /checksum inventory is unsafe/);
  });
});
