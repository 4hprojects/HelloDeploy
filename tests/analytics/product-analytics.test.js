import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ProductEvent } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { recordProductEvent, getUxMetrics } =
  await import('../../apps/web/src/services/product-analytics.service.js');

describe('privacy-minimized product analytics', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('drops unknown events and strips non-allowlisted properties', async () => {
    await recordProductEvent({ name: 'not_allowed', properties: { url: 'https://private.test' } });
    await recordProductEvent({
      name: 'web_vital',
      userId: objectId(),
      properties: {
        metric: 'LCP',
        value: 1234.56789,
        viewport: 'mobile',
        page: 'dashboard',
        url: 'https://private.test/repository-name',
        credential: 'secret',
      },
    });

    const events = await ProductEvent.find().lean();
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].properties, {
      metric: 'LCP',
      value: 1234.568,
      viewport: 'mobile',
      page: 'dashboard',
    });
    assert.doesNotMatch(JSON.stringify(events[0]), /private|credential|secret/);
  });

  it('computes bounded p75 Web Vitals and defaults to a 30-day window', async () => {
    for (const value of [100, 200, 300, 400]) {
      await recordProductEvent({
        name: 'web_vital',
        properties: { metric: 'INP', value, viewport: 'desktop', page: 'landing' },
      });
    }
    const metrics = await getUxMetrics(999);
    assert.equal(metrics.days, 30);
    assert.equal(metrics.counts.web_vital, 4);
    assert.equal(metrics.p75['INP:desktop'], 300);
  });

  it('declares the 90-day TTL without inspecting event contents', () => {
    const ttl = ProductEvent.schema
      .indexes()
      .find(([keys, options]) => keys.createdAt === 1 && options.expireAfterSeconds);
    assert.equal(ttl[1].expireAfterSeconds, 90 * 24 * 60 * 60);
  });
});
