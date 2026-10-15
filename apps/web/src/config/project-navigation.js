import { DomainRoutingState, DomainStatus, ProjectRole } from '@hellodeploy/contracts';

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
    key: 'activity',
    label: 'Activity',
    path: '/activity',
    icon: 'activity',
    roles: [ProjectRole.OWNER, ProjectRole.MAINTAINER],
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'settings',
    roles: [ProjectRole.OWNER],
  },
]);

const SETUP_STEPS_BY_NAV_KEY = Object.freeze({
  overview: ['project', 'approval'],
  repository: ['source'],
  detection: ['check'],
  environment: ['environment'],
  deployments: ['deployment', 'live'],
});

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

export function buildProjectNavigation(slug, role, currentPath = '') {
  const base = `/projects/${slug}`;
  return PROJECT_NAVIGATION.filter((item) => roleCanAccess(item, role)).map((item) => {
    const href = `${base}${item.path}`;
    const active = item.path ? currentPath.startsWith(href) : currentPath === base;
    return { ...item, href, active };
  });
}

// A custom domain that still needs the owner or the platform: mid-setup, failed,
// or live in Nginx while the last routing check found traffic going elsewhere.
// Never-checked routing (UNKNOWN) does not count, or every older working domain
// would be flagged.
export const PENDING_DOMAIN_FILTER = Object.freeze({
  $or: [
    {
      status: {
        $in: [
          DomainStatus.PENDING_VERIFICATION,
          DomainStatus.VERIFYING,
          DomainStatus.VERIFIED,
          DomainStatus.PENDING_ADMIN_APPROVAL,
          DomainStatus.ACTIVATING,
          DomainStatus.FAILED,
        ],
      },
    },
    {
      status: DomainStatus.ACTIVE,
      routingState: {
        $in: [
          DomainRoutingState.NOT_POINTED,
          DomainRoutingState.TUNNEL_DOWN,
          DomainRoutingState.FOREIGN,
        ],
      },
    },
  ],
});

export function withDomainMark(navigation, hasPendingDomain) {
  if (!hasPendingDomain) {
    return navigation;
  }
  return navigation.map((item) =>
    item.key === 'domains' ? { ...item, setupMark: 'pending' } : item,
  );
}

export function withSetupMarks(navigation, setupGuide) {
  if (!setupGuide) {
    return navigation;
  }
  const nextStepKey = setupGuide.milestones[setupGuide.nextStepIndex]?.key;
  return navigation.map((item) => {
    const stepKeys = SETUP_STEPS_BY_NAV_KEY[item.key];
    if (!stepKeys) {
      return { ...item, setupMark: null };
    }
    const steps = setupGuide.milestones.filter((milestone) => stepKeys.includes(milestone.key));
    const setupMark = stepKeys.includes(nextStepKey)
      ? 'next'
      : steps.every((milestone) => milestone.done)
        ? 'done'
        : null;
    return { ...item, setupMark };
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
