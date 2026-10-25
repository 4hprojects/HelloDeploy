import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { BUILDER_LIMITS } from '@hellodeploy/contracts';

const read = (name) =>
  readFile(new URL(`../../infrastructure/builder/${name}`, import.meta.url), 'utf8');

const unit = await read('hellodeploy-buildkitd.service');
const install = await read('install-builder.sh');
const uninstall = await read('uninstall-builder.sh');
const verify = await read('verify-builder.sh');
const polkit = await read('50-hellodeploy-builder.rules');
const egress = await read('egress.nft');
const buildkitd = await read('buildkitd.toml');

/** Lines that run a command (comments dropped), so prose cannot satisfy a check. */
function commands(script) {
  return script
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

describe('builder unit', () => {
  it('caps memory at the code limit', () => {
    assert.match(unit, new RegExp(`^MemoryMax=${BUILDER_LIMITS.memoryMaxMb}M$`, 'm'));
  });

  it('gives the builder no swap', () => {
    assert.match(unit, /^MemorySwapMax=0$/m);
  });

  it('caps CPU at the code limit', () => {
    assert.match(unit, new RegExp(`^CPUQuota=${BUILDER_LIMITS.cpuCores * 100}%$`, 'm'));
  });

  it('is never restarted automatically', () => {
    assert.match(unit, /^Restart=no$/m);
  });

  it('cannot start at boot', () => {
    assert.doesNotMatch(unit, /^\[Install\]/m);
  });

  it('runs as the unprivileged builder user', () => {
    assert.match(unit, /^User=hellodeploy-builder$/m);
  });

  it('refuses to start without its egress firewall', () => {
    assert.match(
      unit,
      /^ExecStartPre=\+\/usr\/sbin\/nft -f \/etc\/hellodeploy-builder\/egress\.nft$/m,
    );
  });

  it('listens only on its own socket', () => {
    assert.match(buildkitd, /address = \["unix:\/\/\/run\/hellodeploy-builder\/buildkitd\.sock"\]/);
  });

  it('runs one build step set at a time', () => {
    assert.match(buildkitd, /max-parallelism = 1/);
  });
});

describe('builder install script', () => {
  it('sizes the cache store at the code limit', () => {
    assert.match(install, new RegExp(`^STORE_SIZE="${BUILDER_LIMITS.storeSizeGb}G"$`, 'm'));
  });

  it('verifies pinned checksums for every download', () => {
    assert.equal((commands(install).match(/sha256sum -c/g) ?? []).length, 2);
  });

  it('never restarts or reloads another service', () => {
    assert.doesNotMatch(
      commands(install),
      /systemctl (?:restart|reload|stop|start)\b|docker\.service|nginx|cloudflared|hellodeploy-(?:web|worker)\.service/,
    );
  });

  it('never enables the builder unit', () => {
    assert.doesNotMatch(commands(install), /systemctl enable[^\n]*\$UNIT/);
  });

  it('never reformats an existing cache image', () => {
    assert.match(install, /if \[\[ ! -f "\$STORE_IMAGE" \]\]; then\n\s+fallocate/);
  });
});

describe('builder polkit rule', () => {
  it('names only the builder unit', () => {
    assert.match(polkit, /action\.lookup\('unit'\) === 'hellodeploy-buildkitd\.service'/);
  });

  it('allows only start, stop and kill', () => {
    assert.match(polkit, /\['start', 'stop', 'kill'\]\.indexOf\(action\.lookup\('verb'\)\)/);
  });

  it('applies only to the builder control group', () => {
    assert.match(polkit, /subject\.isInGroup\('hellodeploy-builder-control'\)/);
  });

  it('leaves every other request to the normal policy', () => {
    assert.match(polkit, /return polkit\.Result\.NOT_HANDLED;/);
  });
});

describe('builder egress firewall', () => {
  it('matches only the builder user', () => {
    assert.match(egress, /meta skuid != "hellodeploy-builder" accept/);
  });

  it('drops private, link-local and loopback destinations', () => {
    assert.match(
      egress,
      /10\.0\.0\.0\/8, 100\.64\.0\.0\/10, 127\.0\.0\.0\/8, 169\.254\.0\.0\/16, 172\.16\.0\.0\/12, 192\.168\.0\.0\/16/,
    );
  });

  it('allows only DNS, HTTP and HTTPS', () => {
    assert.match(egress, /th dport \{ 53, 80, 443 \} accept\n\s+drop\n/);
  });

  it('reloads without duplicating rules', () => {
    assert.match(
      egress,
      /^add table inet hellodeploy_builder\ndelete table inet hellodeploy_builder$/m,
    );
  });
});

describe('builder verify and uninstall scripts', () => {
  it('checks the polkit boundary as the worker user', () => {
    assert.match(verify, /runuser -u "\$WORKER_USER" -- systemctl --no-ask-password/);
  });

  it('proves the builder cannot use the Docker socket', () => {
    assert.match(verify, /refuse "builder cannot use the Docker daemon socket"/);
  });

  it('keeps the cache image unless asked to delete it', () => {
    assert.match(uninstall, /if \$DELETE_STORE; then\n\s+rm -f "\$STORE_IMAGE"/);
  });

  it('stops only the builder unit', () => {
    assert.deepEqual(commands(uninstall).match(/systemctl stop \S+/g), ['systemctl stop "$UNIT"']);
  });
});
