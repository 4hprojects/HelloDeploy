import { PlatformSetting } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';

export const MAINTENANCE_MODE_KEY = 'maintenanceMode';

export async function getMaintenanceMode() {
  const setting = await PlatformSetting.findOne({ key: MAINTENANCE_MODE_KEY }).lean();
  return {
    enabled: Boolean(setting?.value?.enabled),
    message: setting?.value?.message ?? null,
    updatedAt: setting?.updatedAt ?? null,
    updatedBy: setting?.updatedBy ?? null,
  };
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

  return {
    success: true,
    maintenance: {
      enabled: Boolean(setting.value?.enabled),
      message: setting.value?.message ?? null,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updatedBy,
    },
  };
}
