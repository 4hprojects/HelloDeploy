import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const web = await readFile(
  new URL('../../infrastructure/systemd/hellodeploy-web.service', import.meta.url),
  'utf8',
);
const worker = await readFile(
  new URL('../../infrastructure/systemd/hellodeploy-worker.service', import.meta.url),
  'utf8',
);
const helper = await readFile(
  new URL('../../infrastructure/systemd/hellodeploy-nginx-helper.service', import.meta.url),
  'utf8',
);
const installer = await readFile(
  new URL('../../infrastructure/install.sh', import.meta.url),
  'utf8',
);
const helperServer = await readFile(
  new URL('../../infrastructure/nginx/helper-server.js', import.meta.url),
  'utf8',
);

describe('Ubuntu systemd privilege separation', () => {
  it('runs web without Docker or Nginx helper group membership', () => {
    assert.match(web, /^User=hellodeploy-web$/m);
    assert.doesNotMatch(web, /docker|hellodeploy-nginx/);
    assert.match(web, /^NoNewPrivileges=true$/m);
  });

  it('grants Docker and helper socket groups only to the worker', () => {
    assert.match(worker, /^User=hellodeploy-worker$/m);
    assert.match(worker, /^SupplementaryGroups=docker hellodeploy-nginx$/m);
    assert.match(installer, /docker "\$HD_WORKER_USER"/);
    assert.doesNotMatch(installer, /docker "\$HD_WEB_USER"/);
  });

  it('runs the root helper with a protected local runtime directory', () => {
    assert.match(helper, /^User=root$/m);
    assert.match(helper, /^Group=hellodeploy-nginx$/m);
    assert.match(helper, /^RuntimeDirectory=hellodeploy$/m);
    assert.match(helper, /^ProtectSystem=strict$/m);
    assert.doesNotMatch(helper, /ListenStream|0\.0\.0\.0/);
    assert.match(helperServer, /createServer\(\{ allowHalfOpen: true \}/);
    assert.match(helperServer, /chmod\(socketPath, 0o660\)/);
  });
});
