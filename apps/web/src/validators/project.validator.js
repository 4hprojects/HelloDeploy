import { ProjectRole } from '@hellodeploy/contracts';

const INVITE_ROLES = [ProjectRole.MAINTAINER, ProjectRole.VIEWER];

export function validateCreateProject(body) {
  const errors = {};

  const name = body.name?.trim() ?? '';
  if (!name) {
    errors.name = 'Project name is required.';
  } else if (name.length < 2) {
    errors.name = 'Project name must be at least 2 characters.';
  } else if (name.length > 100) {
    errors.name = 'Project name must be 100 characters or fewer.';
  } else if (!/^[a-zA-Z0-9]/.test(name)) {
    errors.name = 'Project name must start with a letter or digit.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

export function validateUpdateProject(body) {
  const errors = {};

  const name = body.name?.trim() ?? '';
  if (!name) {
    errors.name = 'Project name is required.';
  } else if (name.length < 2) {
    errors.name = 'Project name must be at least 2 characters.';
  } else if (name.length > 100) {
    errors.name = 'Project name must be 100 characters or fewer.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

export function validateUpdateBuildConfiguration(body) {
  const errors = {};

  const buildCommand = body.buildCommand?.trim() ?? '';
  if (buildCommand.length > 500) {
    errors.buildCommand = 'Build command must be 500 characters or fewer.';
  }

  const startCommand = body.startCommand?.trim() ?? '';
  if (startCommand.length > 500) {
    errors.startCommand = 'Start command must be 500 characters or fewer.';
  }

  const outputDirectory = body.outputDirectory?.trim() ?? '';
  if (outputDirectory.length > 255) {
    errors.outputDirectory = 'Output directory must be 255 characters or fewer.';
  }

  const applicationPortRaw = body.applicationPort?.trim() ?? '';
  if (applicationPortRaw) {
    const port = Number(applicationPortRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.applicationPort = 'Application port must be a number between 1 and 65535.';
    }
  }

  const healthCheckPath = body.healthCheckPath?.trim() ?? '';
  if (healthCheckPath) {
    if (!healthCheckPath.startsWith('/')) {
      errors.healthCheckPath = 'Health check path must start with "/".';
    } else if (healthCheckPath.includes('://')) {
      errors.healthCheckPath = 'Health check path must be a path, not a full URL.';
    } else if (healthCheckPath.length > 255) {
      errors.healthCheckPath = 'Health check path must be 255 characters or fewer.';
    }
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

function parsePathList(raw) {
  return (raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function validateUpdateBuildFilters(body) {
  const errors = {};

  const includedPaths = parsePathList(body.includedPaths);
  const ignoredPaths = parsePathList(body.ignoredPaths);

  if (includedPaths.length > 20) {
    errors.includedPaths = 'No more than 20 included path patterns are allowed.';
  } else if (includedPaths.some((p) => p.length > 200)) {
    errors.includedPaths = 'Each path pattern must be 200 characters or fewer.';
  }

  if (ignoredPaths.length > 20) {
    errors.ignoredPaths = 'No more than 20 ignored path patterns are allowed.';
  } else if (ignoredPaths.some((p) => p.length > 200)) {
    errors.ignoredPaths = 'Each path pattern must be 200 characters or fewer.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0, includedPaths, ignoredPaths };
}

export function validateMaintenanceMessage(body) {
  const errors = {};

  const message = body.message?.trim() ?? '';
  if (message.length > 200) {
    errors.message = 'Maintenance message must be 200 characters or fewer.';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}

export function validateInviteMember(body) {
  const errors = {};

  const email = body.email?.trim() ?? '';
  if (!email) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!body.role || !INVITE_ROLES.includes(body.role)) {
    errors.role = 'Select a valid role (Maintainer or Viewer).';
  }

  return { errors, hasErrors: Object.keys(errors).length > 0 };
}
