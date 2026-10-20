export const DEPLOYMENT_ENVIRONMENT_KEY = 'deployment-environment';
export const LEGACY_PRODUCTION_ENVIRONMENT = 'production';
export const DEPLOYMENT_ENVIRONMENT_SCHEMA_VERSION = 1;
export const NONPRODUCTION_ENVIRONMENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/;

export function isValidNonproductionEnvironmentId(value) {
  return typeof value === 'string' && NONPRODUCTION_ENVIRONMENT_ID_PATTERN.test(value);
}

export function createNonproductionEnvironmentMarker(environmentId) {
  if (!isValidNonproductionEnvironmentId(environmentId)) {
    throw new TypeError('Nonproduction environment id is invalid.');
  }
  return {
    schemaVersion: DEPLOYMENT_ENVIRONMENT_SCHEMA_VERSION,
    environmentClass: 'nonproduction',
    environmentId,
  };
}

export function isNonproductionEnvironmentMarker(marker) {
  return (
    marker?.schemaVersion === DEPLOYMENT_ENVIRONMENT_SCHEMA_VERSION &&
    marker?.environmentClass === 'nonproduction' &&
    isValidNonproductionEnvironmentId(marker?.environmentId)
  );
}
