import { ProjectRole } from '@hellodeploy/contracts';

const PROJECT_NAVIGATION = Object.freeze([
  { key: 'overview', label: 'Overview', path: '', icon: 'overview' },
  { key: 'deployments', label: 'Deployments', path: '/deployments', icon: 'deploy' },
  {
    key: 'repository',
    label: 'Repository',
    path: '/repository',
    icon: 'repository',
    roles: [ProjectRole.OWNER],
  },
  { key: 'detection', label: 'Detection', path: '/detection', icon: 'detection' },
  { key: 'domains', label: 'Domains', path: '/domains', icon: 'domain' },
  {
    key: 'deploy-hook',
    label: 'Deploy Hook',
    path: '/deploy-hook',
    icon: 'deploy',
    roles: [ProjectRole.OWNER],
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
  { key: 'source-build', label: 'Source & Build', currentPath: '/detection' },
  { key: 'deployment', label: 'Deployment', currentPath: '/deploy-hook' },
  { key: 'custom-domains', label: 'Custom Domains', currentPath: '/domains' },
  { key: 'notifications', label: 'Notifications', currentPath: '' },
  {
    key: 'health-maintenance',
    label: 'Health & Maintenance',
    currentPath: '/detection',
  },
  { key: 'danger-zone', label: 'Danger Zone', currentPath: '/edit' },
]);

function roleCanAccess(item, role) {
  return !item.roles || item.roles.includes(role);
}

export function buildProjectNavigation(slug, role, currentPath = '') {
  const base = `/projects/${slug}`;
  return PROJECT_NAVIGATION.filter((item) => roleCanAccess(item, role)).map((item) => {
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
