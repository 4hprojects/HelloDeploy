import { ProjectRole, UiMode } from '@hellodeploy/contracts';

// `modes` lists the interface modes an item appears in. Items without it show
// in every mode. Infrastructure-oriented pages are ADVANCED-only: they remain
// fully functional and routable in SIMPLE, just absent from the navigation.
const ADVANCED_ONLY = Object.freeze([UiMode.ADVANCED]);

const PROJECT_NAVIGATION = Object.freeze([
  { key: 'overview', label: 'Overview', path: '', icon: 'overview' },
  { key: 'deployments', label: 'Deployments', path: '/deployments', icon: 'deploy' },
  {
    key: 'repository',
    label: 'Repository',
    path: '/repository',
    icon: 'repository',
    roles: [ProjectRole.OWNER],
    modes: ADVANCED_ONLY,
  },
  {
    key: 'detection',
    label: 'Detection',
    path: '/detection',
    icon: 'detection',
    modes: ADVANCED_ONLY,
  },
  { key: 'domains', label: 'Domains', path: '/domains', icon: 'domain' },
  {
    key: 'deploy-hook',
    label: 'Deploy Hook',
    path: '/deploy-hook',
    icon: 'deploy',
    roles: [ProjectRole.OWNER],
    modes: ADVANCED_ONLY,
  },
  {
    key: 'environment',
    label: 'Environment',
    path: '/environment',
    icon: 'environment',
    roles: [ProjectRole.OWNER],
  },
  {
    key: 'members',
    label: 'Members',
    path: '/members',
    icon: 'users',
    roles: [ProjectRole.OWNER],
    modes: ADVANCED_ONLY,
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'settings',
    roles: [ProjectRole.OWNER],
  },
]);

export const SETTINGS_SECTIONS = Object.freeze([
  { key: 'general', label: 'General', currentPath: '/edit' },
  { key: 'source-build', label: 'App Setup', currentPath: '/detection' },
  { key: 'deployment', label: 'Deployment', currentPath: '/deploy-hook' },
  { key: 'custom-domains', label: 'Custom Domains', currentPath: '/domains' },
  { key: 'notifications', label: 'Notifications', currentPath: '' },
  {
    key: 'health-maintenance',
    label: 'Availability',
    currentPath: '/detection',
  },
  { key: 'danger-zone', label: 'Danger Zone', currentPath: '/edit' },
]);

function roleCanAccess(item, role) {
  return !item.roles || item.roles.includes(role);
}

function modeCanAccess(item, uiMode) {
  return !item.modes || item.modes.includes(uiMode);
}

export function buildProjectNavigation(slug, role, currentPath = '', uiMode = UiMode.SIMPLE) {
  const base = `/projects/${slug}`;
  return PROJECT_NAVIGATION.filter(
    (item) => roleCanAccess(item, role) && modeCanAccess(item, uiMode),
  ).map((item) => {
    const href = `${base}${item.path}`;
    const active = item.path ? currentPath.startsWith(href) : currentPath === base;
    return { ...item, href, active };
  });
}

export function buildSettingsSections(slug) {
  const base = `/projects/${slug}`;
  const settingsPath = `${base}/settings`;
  return SETTINGS_SECTIONS.map((section) => ({
    ...section,
    href: `${settingsPath}#${section.key}`,
    currentHref: `${base}${section.currentPath}`,
  }));
}
