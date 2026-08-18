import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { PlatformSetting } from '@hellodeploy/database';
import {
  startApprovalTestDb,
  stopApprovalTestDb,
  clearApprovalTestDb,
  approvalObjectId,
} from '../helpers/approval-db.js';

const { getMaintenanceMode, setMaintenanceMode, MAINTENANCE_MODE_KEY } =
  await import('../../apps/web/src/services/platform-settings.service.js');

describe('platform settings maintenance-mode caching', () => {
  before(async () => {
    await startApprovalTestDb();
  });
  after(async () => {
    await stopApprovalTestDb();
  });
  beforeEach(async () => {
    await clearApprovalTestDb();
  });

  it('serves a cached value instead of re-reading a change made directly in the database', async () => {
    await getMaintenanceMode();
    await PlatformSetting.updateOne(
      { key: MAINTENANCE_MODE_KEY },
      { $set: { value: { enabled: true, message: 'bypassed the cache' } } },
      { upsert: true },
    );

    const result = await getMaintenanceMode();

    assert.equal(result.enabled, false);
  });

  it('updates the cache immediately when setMaintenanceMode is called', async () => {
    await setMaintenanceMode({
      enabled: true,
      message: 'Upgrading',
      adminId: approvalObjectId(),
      adminRole: 'SUPER_ADMIN',
      sourceIp: '127.0.0.1',
      correlationId: 'corr-1',
    });

    const result = await getMaintenanceMode();

    assert.equal(result.enabled, true);
  });
});
