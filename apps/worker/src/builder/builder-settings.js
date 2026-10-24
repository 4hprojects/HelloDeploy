import { BUILDER_SETTINGS_KEY, normalizeBuilderSettings } from '@hellodeploy/contracts';
import { PlatformSetting, User } from '@hellodeploy/database';

/** The super-admin settings, closed by default when none are stored. */
export async function loadBuilderSettings() {
  const setting = await PlatformSetting.findOne({ key: BUILDER_SETTINGS_KEY }).lean();
  return normalizeBuilderSettings(setting?.value);
}

/** A user's current platform role, or null when the user no longer exists. */
export async function loadPlatformRole(userId) {
  if (!userId) {
    return null;
  }
  const user = await User.findById(userId).select('platformRole').lean();
  return user?.platformRole ?? null;
}
