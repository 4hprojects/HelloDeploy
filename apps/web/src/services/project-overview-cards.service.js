/**
 * The at-a-glance cards on a website's overview.
 *
 * Answers the questions an owner actually has — is my website up, did the last
 * publish work, where does the code come from, is my domain connected — without
 * naming a container, a port or a proxy.
 *
 * Pure, so the wording is testable without a database. Each card states its
 * condition in words; the view adds a glyph, never colour alone.
 */

import {
  DeploymentStatus,
  DomainRoutingState,
  DomainStatus,
  DeploymentMode,
  ProjectStatus,
} from '@hellodeploy/contracts';

export const CARD_STATE = Object.freeze({
  GOOD: 'GOOD',
  WORKING: 'WORKING',
  ATTENTION: 'ATTENTION',
  NEUTRAL: 'NEUTRAL',
});

const IN_FLIGHT = new Set([
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
]);

/**
 * @param {{
 *   project: object,
 *   repository?: object|null,
 *   activeDeployment?: object|null,
 *   latestDeployment?: object|null,
 *   domains?: Array<object>,
 * }} params
 * @returns {Array<{ key: string, label: string, value: string, state: string, detail: string|null }>}
 */
export function buildOverviewCards({
  project,
  repository = null,
  activeDeployment = null,
  latestDeployment = null,
  domains = [],
}) {
  return [
    websiteStatusCard(project, activeDeployment),
    latestPublishCard(latestDeployment),
    sourceCard(project, repository),
    automaticPublishingCard(project),
    domainCard(domains),
    secureCard(domains, activeDeployment),
  ];
}

function card(key, label, value, state, detail = null) {
  return { key, label, value, state, detail };
}

function websiteStatusCard(project, activeDeployment) {
  if (project.maintenanceMode?.enabled) {
    return card(
      'website_status',
      'Website',
      'Paused',
      CARD_STATE.ATTENTION,
      'Visitors see your maintenance page.',
    );
  }

  if (project.status === ProjectStatus.SUSPENDED) {
    return card('website_status', 'Website', 'Suspended', CARD_STATE.ATTENTION, null);
  }

  if (project.status === ProjectStatus.ARCHIVED) {
    return card('website_status', 'Website', 'Archived', CARD_STATE.NEUTRAL, null);
  }

  if (activeDeployment?.status === DeploymentStatus.HEALTHY) {
    return card('website_status', 'Website', 'Online', CARD_STATE.GOOD, null);
  }

  return card(
    'website_status',
    'Website',
    'Not published yet',
    CARD_STATE.NEUTRAL,
    'Publish it to put it online.',
  );
}

function latestPublishCard(latestDeployment) {
  if (!latestDeployment) {
    return card('latest_publish', 'Last publish', 'None yet', CARD_STATE.NEUTRAL, null);
  }

  if (IN_FLIGHT.has(latestDeployment.status)) {
    return card('latest_publish', 'Last publish', 'In progress', CARD_STATE.WORKING, null);
  }

  if (latestDeployment.status === DeploymentStatus.HEALTHY) {
    return card('latest_publish', 'Last publish', 'Successful', CARD_STATE.GOOD, null);
  }

  if (latestDeployment.status === DeploymentStatus.FAILED) {
    return card(
      'latest_publish',
      'Last publish',
      'Did not finish',
      CARD_STATE.ATTENTION,
      'Open it to see what stopped.',
    );
  }

  return card('latest_publish', 'Last publish', 'Stopped', CARD_STATE.NEUTRAL, null);
}

function sourceCard(project, repository) {
  if (!repository) {
    return card(
      'source',
      'Code',
      'Not connected',
      CARD_STATE.ATTENTION,
      'Connect a GitHub project to publish.',
    );
  }

  const branch = project.productionBranch ?? repository.defaultBranch;
  return card(
    'source',
    'Code',
    repository.fullName,
    CARD_STATE.GOOD,
    branch ? `on ${branch}` : null,
  );
}

function automaticPublishingCard(project) {
  const enabled = project.deploymentMode === DeploymentMode.AUTOMATIC;
  return card(
    'automatic_publishing',
    'Automatic publishing',
    enabled ? 'On' : 'Off',
    enabled ? CARD_STATE.GOOD : CARD_STATE.NEUTRAL,
    enabled ? 'New changes publish themselves.' : 'You publish each change yourself.',
  );
}

function domainCard(domains) {
  if (domains.length === 0) {
    return card(
      'domain',
      'Your domain',
      'Not connected',
      CARD_STATE.NEUTRAL,
      'You can use your own web address.',
    );
  }

  const active = domains.find((domain) => domain.status === DomainStatus.ACTIVE);
  if (!active) {
    return card('domain', 'Your domain', 'Still connecting', CARD_STATE.WORKING, null);
  }

  // Routing being ACTIVE inside nginx says nothing about whether public DNS
  // reaches this platform, so a domain that is routed but not pointed here is
  // reported as needing attention rather than as connected.
  if (active.routingState === DomainRoutingState.NOT_POINTED) {
    return card(
      'domain',
      'Your domain',
      active.hostnameNormalized,
      CARD_STATE.ATTENTION,
      'Your domain is not pointing here yet.',
    );
  }

  if (active.routingState === DomainRoutingState.FOREIGN) {
    return card(
      'domain',
      'Your domain',
      active.hostnameNormalized,
      CARD_STATE.ATTENTION,
      'Your domain currently points somewhere else.',
    );
  }

  return card('domain', 'Your domain', active.hostnameNormalized, CARD_STATE.GOOD, null);
}

function secureCard(domains, activeDeployment) {
  const isOnline = activeDeployment?.status === DeploymentStatus.HEALTHY;
  if (!isOnline) {
    return card('secure', 'Secure connection', 'Not yet', CARD_STATE.NEUTRAL, null);
  }

  const connectingDomain = domains.some(
    (domain) => domain.status !== DomainStatus.ACTIVE && domain.status !== DomainStatus.FAILED,
  );

  if (connectingDomain) {
    return card(
      'secure',
      'Secure connection',
      'Finishing up',
      CARD_STATE.WORKING,
      'Your HelloDeploy address is already secure.',
    );
  }

  // HTTPS terminates upstream for every address HelloDeploy serves, so an online
  // website is served over it. Nothing here inspects a certificate.
  return card('secure', 'Secure connection', 'On', CARD_STATE.GOOD, null);
}

/**
 * "2 minutes ago" style wording for the header.
 *
 * @param {Date|string|null} when
 * @param {Date} [now]
 * @returns {string|null}
 */
export function relativeTime(when, now = new Date()) {
  if (!when) {
    return null;
  }

  const seconds = Math.round((now.getTime() - new Date(when).getTime()) / 1000);
  if (seconds < 60) {
    return 'just now';
  }

  const units = [
    { limit: 3600, size: 60, name: 'minute' },
    { limit: 86400, size: 3600, name: 'hour' },
    { limit: 2592000, size: 86400, name: 'day' },
  ];

  for (const unit of units) {
    if (seconds < unit.limit) {
      const count = Math.floor(seconds / unit.size);
      return `${count} ${unit.name}${count === 1 ? '' : 's'} ago`;
    }
  }

  const months = Math.floor(seconds / 2592000);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}
