import { PlatformSetting } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';

export const COMMENT_SETTINGS_KEY = 'learningHubComments';

const CACHE_TTL_MS = 5_000;
let cached = null;
let cachedAt = 0;

/**
 * The administrator's emergency controls for guest comments. If the setting
 * cannot be read, submissions are treated as switched off: an unreadable
 * switch must never open comments.
 */
export async function getCommentSettings({ Setting = PlatformSetting, now = Date.now } = {}) {
  if (cached && now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const setting = await Setting.findOne({ key: COMMENT_SETTINGS_KEY }).lean();
    cached = {
      submissionsPaused: Boolean(setting?.value?.submissionsPaused),
      pausedArticleIds: Array.isArray(setting?.value?.pausedArticleIds)
        ? setting.value.pausedArticleIds.filter((id) => typeof id === 'string')
        : [],
      readable: true,
    };
    cachedAt = now();
    return cached;
  } catch (error) {
    logger.error('[learning-hub] Comment settings unreadable; submissions closed', {
      error: error.message,
    });
    // Cache the closed result too, so an outage costs one slow read per TTL.
    cached = { submissionsPaused: true, pausedArticleIds: [], readable: false };
    cachedAt = now();
    return cached;
  }
}

export async function setCommentSettings(
  { submissionsPaused, pausedArticleIds, adminId, adminRole, sourceIp, correlationId },
  { Setting = PlatformSetting } = {},
) {
  const value = {
    submissionsPaused: Boolean(submissionsPaused),
    pausedArticleIds: [...new Set(pausedArticleIds ?? [])].filter((id) => typeof id === 'string'),
  };
  await Setting.findOneAndUpdate(
    { key: COMMENT_SETTINGS_KEY },
    { $set: { value, updatedBy: adminId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  cached = { ...value, readable: true };
  cachedAt = Date.now();

  await writeAuditEvent({
    action: value.submissionsPaused
      ? 'admin.learning_hub_comments_paused'
      : 'admin.learning_hub_comments_resumed',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'platform_setting',
    targetId: COMMENT_SETTINGS_KEY,
    sourceIp,
    correlationId,
    metadata: { pausedArticleIds: value.pausedArticleIds },
  });
  return value;
}

/** Test hook: forget the cached setting. */
export function resetCommentSettingsCache() {
  cached = null;
  cachedAt = 0;
}

/**
 * Whether an article shows its discussion and whether it accepts new
 * comments. Every safeguard must be present for `accepting`; reading
 * published comments needs only the feature flag and the article opt-in.
 */
export function evaluateCommentAvailability({
  article,
  featureEnabled,
  settings,
  isTurnstileConfigured,
  isModerationConfigured,
}) {
  const visible = Boolean(featureEnabled && article.commentsEnabled);
  if (!visible) {
    return { visible: false, accepting: false, reason: 'disabled' };
  }
  if (settings.submissionsPaused || settings.pausedArticleIds.includes(article.id)) {
    return { visible: true, accepting: false, reason: 'paused' };
  }
  if (!isTurnstileConfigured || !isModerationConfigured) {
    return { visible: true, accepting: false, reason: 'protection_unavailable' };
  }
  return { visible: true, accepting: true, reason: 'open' };
}
