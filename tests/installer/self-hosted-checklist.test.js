import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const { buildSelfHostedChecklist } = await import('../../scripts/self-hosted-checklist.js');
const setupSource = await readFile(new URL('../../scripts/setup.js', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
const environmentDocs = await readFile(
  new URL('../../docs/ENVIRONMENT.md', import.meta.url),
  'utf8',
);

describe('self-hosted checklist', () => {
  it('defaults to Cloudflare Tunnel mode', () => {
    const checklist = buildSelfHostedChecklist();
    assert.equal(checklist.mode, 'cloudflare_tunnel');
    assert.equal(checklist.label, 'Cloudflare Tunnel');
    assert.equal(checklist.license, 'MIT');
  });

  it('documents Ubuntu 22.04 and 24.04 support', () => {
    const checklist = buildSelfHostedChecklist();
    assert.deepEqual(checklist.supportedUbuntu, ['22.04', '24.04']);
  });

  it('separates startup-blocking keys from integration groups', () => {
    const checklist = buildSelfHostedChecklist();
    assert.ok(checklist.startupBlockingEnvironment.includes('HELLODEPLOY_MASTER_KEY'));
    assert.ok(checklist.startupBlockingEnvironment.includes('MONGODB_URI'));
    assert.ok(!checklist.startupBlockingEnvironment.includes('RESEND_API_KEY'));
    assert.ok(!checklist.startupBlockingEnvironment.includes('TURNSTILE_SECRET_KEY'));

    const github = checklist.integrationEnvironment.find((group) =>
      group.name.startsWith('GitHub App'),
    );
    const turnstile = checklist.integrationEnvironment.find((group) =>
      group.name.startsWith('Cloudflare Turnstile'),
    );
    assert.ok(github.keys.includes('GITHUB_WEBHOOK_SECRET'));
    assert.deepEqual(turnstile.keys, ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']);
  });

  it('supports public IP mode', () => {
    const checklist = buildSelfHostedChecklist({
      mode: 'public_ip',
      domain: 'deploy.example.com',
    });
    assert.equal(checklist.label, 'Public IP');
    assert.equal(checklist.domain, 'deploy.example.com');
    assert.ok(checklist.dns.some((item) => item.includes('public IP')));
  });

  it('does not expose a remote-worker or vendor-dashboard install mode', () => {
    const checklist = buildSelfHostedChecklist({ mode: 'hybrid_worker' });
    assert.equal(checklist.mode, 'cloudflare_tunnel');
    assert.equal(checklist.label, 'Cloudflare Tunnel');
    assert.ok(
      checklist.startupBlockingEnvironment.includes(
        'REDIS_URL (rediss:// for managed Redis) or local REDIS_HOST/REDIS_PORT',
      ),
    );
    assert.ok(!checklist.startupBlockingEnvironment.some((item) => item.includes('ACK')));
  });

  it('falls back to Cloudflare Tunnel for unknown modes', () => {
    const checklist = buildSelfHostedChecklist({ mode: 'unknown' });
    assert.equal(checklist.label, 'Cloudflare Tunnel');
  });

  it('keeps setup output and environment references aligned with runtime validation', () => {
    assert.match(setupSource, /Run npm run config:check/);
    assert.match(setupSource, /Managed Redis URL \(rediss:\/\/ required remotely in production\)/);
    assert.match(setupSource, /Deployment domain \(wildcard app base\)/);
    assert.match(setupSource, /Configure the complete group or leave every value empty/);
    assert.match(setupSource, /githubAppStarted \? '\/etc\/hellodeploy\/github-app\.pem' : ''/);
    assert.match(envExample, /Configure both keys or leave both empty/);
    assert.match(envExample, /GITHUB_APP_PRIVATE_KEY_PATH=\n/);
    assert.match(envExample, /REDIS_URL=rediss:\/\//);
    assert.match(envExample, /DEPLOYMENT_DOMAIN=apps\.hellodeploy\.online/);
    assert.match(environmentDocs, /partial configuration fails validation/);
    assert.match(
      environmentDocs,
      /Diagnostics report configuration names and bounded statuses[\s\S]*never configured values/,
    );
  });
});
