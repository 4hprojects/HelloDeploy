import { ConfigurationError } from '@hellodeploy/contracts';

export const ImageTemplateVersion = Object.freeze({
  LEGACY: 'legacy',
  OPTIMIZED_V1: 'optimized-v1',
});

const PROJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const MAX_OPTIMIZED_PROJECTS = 100;

export function parseImageTemplateVersion(rawValue) {
  if (!Object.values(ImageTemplateVersion).includes(rawValue)) {
    throw new ConfigurationError(
      `USER_IMAGE_TEMPLATE_VERSION must be one of: ${Object.values(ImageTemplateVersion).join(', ')}.`,
    );
  }
  return rawValue;
}

export function parseOptimizedProjectIds(rawValue) {
  if (!rawValue?.trim()) {
    return [];
  }

  const projectIds = [...new Set(rawValue.split(',').map((value) => value.trim().toLowerCase()))];
  if (
    projectIds.length > MAX_OPTIMIZED_PROJECTS ||
    projectIds.some((projectId) => !PROJECT_ID_PATTERN.test(projectId))
  ) {
    throw new ConfigurationError(
      `USER_IMAGE_OPTIMIZED_PROJECT_IDS must contain at most ${MAX_OPTIMIZED_PROJECTS} comma-separated MongoDB object IDs.`,
    );
  }
  return projectIds;
}

export function resolveImageTemplateVersion({ defaultVersion, optimizedProjectIds, projectId }) {
  if (optimizedProjectIds.includes(String(projectId).toLowerCase())) {
    return ImageTemplateVersion.OPTIMIZED_V1;
  }
  return defaultVersion;
}
