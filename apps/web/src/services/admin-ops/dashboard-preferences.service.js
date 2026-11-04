import { User } from '@hellodeploy/database';
import { normalizeDashboardPreferences } from '@hellodeploy/contracts';

/** An administrator's dashboard preferences, with defaults for anything unset. */
export async function getDashboardPreferences(userId) {
  const user = await User.findById(userId).select('dashboardPreferences').lean();
  return normalizeDashboardPreferences(user?.dashboardPreferences);
}

/** Persist already-validated preferences for one account only. */
export async function saveDashboardPreferences(userId, preferences) {
  const value = normalizeDashboardPreferences(preferences);
  await User.updateOne({ _id: userId }, { $set: { dashboardPreferences: value } });
  return value;
}

export async function resetDashboardPreferences(userId) {
  await User.updateOne({ _id: userId }, { $unset: { dashboardPreferences: 1 } });
  return normalizeDashboardPreferences(null);
}

/** Only the sidebar flag changes; every other preference is kept as stored. */
export async function setSidebarCollapsed(userId, collapsed) {
  const current = await getDashboardPreferences(userId);
  return saveDashboardPreferences(userId, { ...current, sidebarCollapsed: Boolean(collapsed) });
}
