import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  CANDIDATE_UBUNTU_RELEASES,
  SUPPORTED_UBUNTU_RELEASES,
  classifyUbuntuRelease,
} from '../../scripts/lib/ubuntu-support.js';

const installer = await readFile(
  new URL('../../infrastructure/install.sh', import.meta.url),
  'utf8',
);

function osRelease(version, id = 'ubuntu') {
  return `ID=${id}\nVERSION_ID="${version}"\n`;
}

describe('Ubuntu support policy', () => {
  it('keeps Ubuntu 22.04 and 24.04 generally supported', () => {
    assert.deepEqual(SUPPORTED_UBUNTU_RELEASES, ['22.04', '24.04']);
    for (const version of SUPPORTED_UBUNTU_RELEASES) {
      assert.deepEqual(classifyUbuntuRelease(osRelease(version)), {
        id: 'ubuntu',
        version,
        tier: 'supported',
        ok: true,
        detail: `Ubuntu ${version} supported`,
      });
    }
  });

  it('fails closed for Ubuntu 26.04 unless candidate use is explicit', () => {
    assert.deepEqual(CANDIDATE_UBUNTU_RELEASES, ['26.04']);
    const blocked = classifyUbuntuRelease(osRelease('26.04'));
    assert.equal(blocked.tier, 'candidate');
    assert.equal(blocked.ok, false);
    assert.match(blocked.detail, /--allow-candidate-os/);

    const acknowledged = classifyUbuntuRelease(osRelease('26.04'), {
      allowCandidate: true,
    });
    assert.equal(acknowledged.tier, 'candidate');
    assert.equal(acknowledged.ok, true);
    assert.match(acknowledged.detail, /explicitly acknowledged/);
  });

  it('rejects other distributions and Ubuntu versions', () => {
    for (const content of [osRelease('25.10'), osRelease('26.04', 'debian'), 'NAME=Unknown\n']) {
      const result = classifyUbuntuRelease(content, { allowCandidate: true });
      assert.equal(result.tier, 'unsupported');
      assert.equal(result.ok, false);
      assert.match(result.detail, /unsupported OS/);
    }
  });

  it('requires the same explicit candidate acknowledgement in the installer', () => {
    assert.match(installer, /HELLODEPLOY_ALLOW_CANDIDATE_OS:-false/);
    assert.match(installer, /OS_ID=.*\$1 == "ID"/);
    assert.match(installer, /ubuntu:22\.04\|ubuntu:24\.04/);
    assert.match(installer, /ubuntu:26\.04/);
    assert.match(installer, /Ubuntu 26\.04 is candidate-only/);
    assert.match(installer, /ALLOW_CANDIDATE_OS" != "true"/);
    assert.match(installer, /does not establish supported status/);
  });
});
