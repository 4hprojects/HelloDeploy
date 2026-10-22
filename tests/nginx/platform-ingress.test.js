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
const ingressScript = await readFile(
  new URL('../../infrastructure/nginx/configure-platform-ingress.sh', import.meta.url),
  'utf8',
);
const defaultSite = await readFile(
  new URL('../../infrastructure/nginx/default-site.conf', import.meta.url),
  'utf8',
);

describe('platform Nginx ingress', () => {
  it('proxies the configured platform host to the local web process', () => {
    assert.match(template, /server_name \{\{PLATFORM_DOMAIN\}\} www\.\{\{PLATFORM_DOMAIN\}\};/);
    assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:\{\{PORT\}\};/);
  });

  it('preserves Cloudflare visitor protocol instead of the HTTP origin scheme', () => {
    assert.match(template, /proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;/);
    assert.doesNotMatch(template, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  });

  it('defines the WebSocket connection variable used by managed application routes', () => {
    assert.match(template, /map \$http_upgrade \$connection_upgrade/);
    assert.match(template, /default upgrade;/);
    assert.match(template, /''\s+close;/);
  });

  it('is configured for both fresh installs and upgrades', () => {
    assert.match(installScript, /configure-platform-ingress\.sh/);
    assert.match(upgradeScript, /configure-platform-ingress\.sh/);
  });
});

// nginx runs as www-data and cannot enter /opt/hellodeploy (root:hellodeploy-config 750, which
// holds the production .env), so the static status pages are published outside it.
describe('static status pages for nginx', () => {
  it('publishes both pages to a directory nginx can read', () => {
    assert.match(
      ingressScript,
      /install -m 0644 [^\n]*site-not-found\.html[^\n]*service-unavailable\.html[^\n]*\/var\/www\/hellodeploy-status\//,
    );
  });

  it('serves the outage page from the published directory', () => {
    assert.match(
      template,
      /location = \/service-unavailable\.html \{\s*root \/var\/www\/hellodeploy-status;/,
    );
  });

  it('serves the site-not-found page from the published directory', () => {
    assert.match(defaultSite, /root \/var\/www\/hellodeploy-status;/);
  });
});
