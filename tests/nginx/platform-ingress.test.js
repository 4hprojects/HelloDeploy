import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const template = await readFile(
  new URL('../../infrastructure/nginx/hellodeploy-platform.conf.template', import.meta.url),
  'utf8',
);
const installScript = await readFile(
  new URL('../../infrastructure/install.sh', import.meta.url),
  'utf8',
);
const upgradeScript = await readFile(
  new URL('../../infrastructure/upgrade.sh', import.meta.url),
  'utf8',
);

describe('platform Nginx ingress', () => {
  it('proxies the configured platform host to the local web process', () => {
    assert.match(template, /server_name \{\{PLATFORM_DOMAIN\}\};/);
    assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:\{\{PORT\}\};/);
  });

  it('preserves Cloudflare visitor protocol instead of the HTTP origin scheme', () => {
    assert.match(template, /proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;/);
    assert.doesNotMatch(template, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  });

  it('is rendered for both fresh installs and upgrades', () => {
    assert.match(installScript, /render-platform-ingress\.sh/);
    assert.match(upgradeScript, /render-platform-ingress\.sh/);
  });
});
