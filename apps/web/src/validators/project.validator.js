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
