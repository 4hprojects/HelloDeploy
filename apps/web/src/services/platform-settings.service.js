import { PlatformSetting } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

export const MAINTENANCE_MODE_KEY = 'maintenanceMode';

// Read on every request via middleware — cache briefly so a burst of traffic
// doesn't hit Mongo per-request. setMaintenanceMode() updates the cache
// immediately so an admin's own toggle is never delayed by it.
const MAINTENANCE_CACHE_TTL_MS = 5_000;
let cachedMaintenance = null;
let cachedAt = 0;

export async function getMaintenanceMode() {
  if (cachedMaintenance && Date.now() - cachedAt < MAINTENANCE_CACHE_TTL_MS) {
    return cachedMaintenance;
  }

  const setting = await PlatformSetting.findOne({ key: MAINTENANCE_MODE_KEY }).lean();
  cachedMaintenance = {
    enabled: Boolean(setting?.value?.enabled),
    message: setting?.value?.message ?? null,
    updatedAt: setting?.updatedAt ?? null,
    updatedBy: setting?.updatedBy ?? null,
  };
  cachedAt = Date.now();
  return cachedMaintenance;
}

export async function setMaintenanceMode({
  enabled,
  message,
  adminId,
  adminRole,
  sourceIp,
  correlationId,
}) {
  const cleanMessage = message?.trim().slice(0, 300) || null;
  const setting = await PlatformSetting.findOneAndUpdate(
    { key: MAINTENANCE_MODE_KEY },
    {
      $set: {
        value: {
          enabled: Boolean(enabled),
          message: cleanMessage,
        },
        updatedBy: adminId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  await writeAuditEvent({
    action: enabled ? 'admin.maintenance_enabled' : 'admin.maintenance_disabled',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'platform_setting',
    targetId: MAINTENANCE_MODE_KEY,
    sourceIp,
    correlationId,
    metadata: { enabled: Boolean(enabled), hasMessage: Boolean(cleanMessage) },
  });

  cachedMaintenance = {
    enabled: Boolean(setting.value?.enabled),
    message: setting.value?.message ?? null,
    updatedAt: setting.updatedAt,
    updatedBy: setting.updatedBy,
  };
  cachedAt = Date.now();

  return {
    success: true,
    maintenance: cachedMaintenance,
  };
}
