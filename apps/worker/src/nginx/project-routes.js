import { createHash } from 'node:crypto';
import { Domain } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';
import { env } from '../config/env.js';
import { isReservedSubdomain, isValidSubdomainLabel } from './reserved-subdomains.js';
import {
  generateHostnameMaintenanceBlock,
  generateHostnameServerBlock,
  generateMaintenanceBlock,
  generateServerBlock,
  isValidRouteHostname,
} from './template.js';

export function customDomainRouteSlug(hostname) {
  if (!isValidRouteHostname(hostname)) {
    throw new Error(`Custom domain "${hostname}" cannot be routed.`);
  }
  const hash = createHash('sha256').update(hostname).digest('hex').slice(0, 16);
  return `custom-${hash}`;
}

export async function listActiveCustomDomains(projectId, DomainModel = Domain) {
  return DomainModel.find({ projectId, status: DomainStatus.ACTIVE })
    .select('hostnameNormalized')
    .sort({ hostnameNormalized: 1 })
    .lean();
}

function assertUsablePlatformSubdomain(project) {
  const subdomain = project.platformSubdomain ?? project.slug;
  if (!isValidSubdomainLabel(subdomain) || isReservedSubdomain(subdomain)) {
    throw new Error(`Subdomain "${subdomain}" cannot be used.`);
  }
  return subdomain;
}

function normalizedCustomHostnames(customDomains) {
  return customDomains
    .map((domain) => domain.hostnameNormalized)
    .map((hostname) => {
      if (!isValidRouteHostname(hostname)) {
        throw new Error(`Custom domain "${hostname}" cannot be routed.`);
      }
      return hostname;
    });
}

export function buildApplicationRouteSet({
  project,
  port,
  deploymentId,
  customDomains = [],
  deploymentDomain = env.DEPLOYMENT_DOMAIN,
}) {
  const subdomain = assertUsablePlatformSubdomain(project);
  const routes = [
    {
      slug: subdomain,
      configContent: generateServerBlock({
        subdomain,
        domain: deploymentDomain,
        port,
        deploymentId,
      }),
    },
  ];

  for (const hostname of normalizedCustomHostnames(customDomains)) {
    routes.push({
      slug: customDomainRouteSlug(hostname),
      configContent: generateHostnameServerBlock({ hostname, port, deploymentId }),
    });
  }
  return routes;
}

export function buildMaintenanceRouteSet({
  project,
  message,
  customDomains = [],
  deploymentDomain = env.DEPLOYMENT_DOMAIN,
}) {
  const subdomain = assertUsablePlatformSubdomain(project);
  const routes = [
    {
      slug: subdomain,
      configContent: generateMaintenanceBlock({ subdomain, domain: deploymentDomain, message }),
    },
  ];

  for (const hostname of normalizedCustomHostnames(customDomains)) {
    routes.push({
      slug: customDomainRouteSlug(hostname),
      configContent: generateHostnameMaintenanceBlock({ hostname, message }),
    });
  }
  return routes;
}
