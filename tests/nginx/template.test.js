import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { generateServerBlock, generateMaintenanceBlock } =
  await import('../../apps/worker/src/nginx/template.js');

const FIXED_DATE = new Date('2024-01-15T12:00:00.000Z');

describe('generateServerBlock', () => {
  it('includes the correct server_name', () => {
    const config = generateServerBlock({
      subdomain: 'my-app',
      domain: 'hellodeploy.online',
      port: 10001,
      deploymentId: 'abc123',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('server_name my-app.hellodeploy.online;'));
  });

  it('proxies to the correct loopback port', () => {
    const config = generateServerBlock({
      subdomain: 'my-app',
      domain: 'hellodeploy.online',
      port: 13456,
      deploymentId: 'abc123',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('proxy_pass http://127.0.0.1:13456;'));
  });

  it('contains the managed comment marker', () => {
    const config = generateServerBlock({
      subdomain: 'my-app',
      domain: 'hellodeploy.online',
      port: 10001,
      deploymentId: 'dep-999',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('# hellodeploy-managed: my-app'));
  });

  it('embeds the deployment ID in a comment', () => {
    const config = generateServerBlock({
      subdomain: 'my-app',
      domain: 'hellodeploy.online',
      port: 10001,
      deploymentId: 'deployment-xyz',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('# deployment: deployment-xyz'));
  });

  it('embeds the generation timestamp', () => {
    const config = generateServerBlock({
      subdomain: 'my-app',
      domain: 'hellodeploy.online',
      port: 10001,
      deploymentId: 'abc',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('2024-01-15T12:00:00.000Z'));
  });

  it('listens on port 80', () => {
    const config = generateServerBlock({
      subdomain: 'test',
      domain: 'example.com',
      port: 10002,
      deploymentId: 'x',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('listen 80;'));
  });

  it('includes standard proxy headers', () => {
    const config = generateServerBlock({
      subdomain: 'app',
      domain: 'example.com',
      port: 10003,
      deploymentId: 'y',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('proxy_set_header Host $host;'));
    assert.ok(config.includes('proxy_set_header X-Real-IP $remote_addr;'));
    assert.ok(config.includes('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'));
    assert.ok(config.includes('proxy_set_header X-Forwarded-Proto $scheme;'));
  });

  it('includes WebSocket upgrade headers', () => {
    const config = generateServerBlock({
      subdomain: 'ws-app',
      domain: 'example.com',
      port: 10004,
      deploymentId: 'z',
      generatedAt: FIXED_DATE,
    });
    assert.ok(config.includes('proxy_set_header Upgrade $http_upgrade;'));
    assert.ok(config.includes('proxy_set_header Connection $connection_upgrade;'));
  });

  it('produces different configs for different ports', () => {
    const opts = {
      subdomain: 'app',
      domain: 'example.com',
      deploymentId: 'x',
      generatedAt: FIXED_DATE,
    };
    const a = generateServerBlock({ ...opts, port: 10000 });
    const b = generateServerBlock({ ...opts, port: 10001 });
    assert.notEqual(a, b);
  });

  it('generates default timestamp when generatedAt is omitted', () => {
    const config = generateServerBlock({
      subdomain: 'app',
      domain: 'example.com',
      port: 10000,
      deploymentId: 'no-date',
    });
    // Should still contain a valid ISO timestamp
    assert.ok(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(config));
  });
});

describe('generateMaintenanceBlock', () => {
  it('includes the correct server_name', () => {
    const config = generateMaintenanceBlock({ subdomain: 'my-app', domain: 'hellodeploy.online' });
    assert.ok(config.includes('server_name my-app.hellodeploy.online;'));
  });

  it('returns 503', () => {
    const config = generateMaintenanceBlock({ subdomain: 'my-app', domain: 'hellodeploy.online' });
    assert.ok(config.includes('return 503'));
  });

  it('includes Retry-After header', () => {
    const config = generateMaintenanceBlock({ subdomain: 'my-app', domain: 'hellodeploy.online' });
    assert.ok(config.includes('Retry-After'));
  });
});
